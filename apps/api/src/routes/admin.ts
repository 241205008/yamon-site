import {
  idSchema,
  invitationInputSchema,
  roleChangeInputSchema,
  WITHDRAWN_USER_NAME,
  type AdminInvitation,
  type AdminUser,
  type AuditAction,
  type AuditLogEntry,
  type Role,
  type SessionUser,
} from '@yamon/shared';
import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requirePermission, type AuthedEnv } from '../auth/middleware';
import { newToken, sha256 } from '../auth/session';
import { schema, type Db } from '../db/client';
import { errorBody } from '../errors';
import { invitationExpiresAt, invitationMail, invitationStatus, invitationUrl } from '../invitations';
import { validate } from '../validator';

const { users, invitations, auditLogs, sessions, passwordResetTokens } = schema;

/** 一覧で返す件数の上限（約100人・300人規模なら足りる） */
const LIST_LIMIT = 200;

/**
 * 管理者が0人にならないことの確認を、同時に操作されても崩れないようにするためのロックの番号。
 * pg_advisory_xact_lock はトランザクションの終わりで自動で外れる
 */
const ADMIN_GUARD_LOCK = 724_011;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const idParam = validate('param', z.object({ id: idSchema }));

const notFound = () => new HTTPException(404, { message: 'ユーザーが見つかりません' });
const conflict = (message: string) => new HTTPException(409, { message });

/**
 * ユーザーの状態を変える操作を、管理者のロックを取ったトランザクションで行う。
 * 対象の行を読み直してから fn に渡すので、別の管理者の操作と重なっても、古い状態で判断しない
 */
async function withUserLocked<T>(db: Db, userId: string, fn: (tx: Tx, target: typeof users.$inferSelect) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_GUARD_LOCK})`);
    const [target] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) throw notFound();
    return fn(tx, target);
  });
}

/** 有効な管理者が対象1人だけなら、管理者でなくする操作（降格・無効化・退会）を断る（D25） */
async function assertNotLastAdmin(tx: Tx, target: typeof users.$inferSelect) {
  if (target.role !== 'admin' || target.status !== 'active') return;
  const [{ admins }] = await tx
    .select({ admins: count() })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.status, 'active')));
  if (admins <= 1) {
    throw conflict('最後の1人の管理者は、降格・無効化・退会させられません。先に別の人を管理者にしてください');
  }
}

function assertNotSelf(actor: SessionUser, targetId: string) {
  if (actor.id === targetId) {
    throw new HTTPException(400, { message: '自分自身には実行できません。別の管理者に頼んでください' });
  }
}

async function audit(tx: Tx, actor: SessionUser, targetUserId: string, action: AuditAction, roles?: { from: Role; to: Role }) {
  await tx.insert(auditLogs).values({
    actorId: actor.id,
    targetUserId,
    action,
    fromRole: roles?.from ?? null,
    toRole: roles?.to ?? null,
  });
}

const toAdminUser = (u: typeof users.$inferSelect): AdminUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  status: u.status,
  createdAt: u.createdAt.toISOString(),
});

// /api/admin 以下は、すべて管理者だけが使える（MVP 2章「招待、役割の変更、無効化、退会処理」）。
// 先頭の requirePermission を通るので、各ハンドラーでは c.get('user') が必ず入っている
export const adminRoutes = new Hono<AuthedEnv>()
  .use(requirePermission('users.manage'))

  // ---------------------------------------------------------------- ユーザー
  .get('/users', async (c) => {
    const rows = await c.get('db').select().from(users).orderBy(asc(users.createdAt)).limit(LIST_LIMIT);
    return c.json({ users: rows.map(toAdminUser) });
  })

  .patch('/users/:id/role', idParam, validate('json', roleChangeInputSchema), async (c) => {
    const actor = c.get('user');
    const { id } = c.req.valid('param');
    const { role } = c.req.valid('json');
    const user = await withUserLocked(c.get('db'), id, async (tx, target) => {
      if (target.status === 'withdrawn') throw conflict('退会したユーザーの役割は変えられません');
      if (target.role === role) return target;
      if (role !== 'admin') await assertNotLastAdmin(tx, target);
      const [updated] = await tx.update(users).set({ role }).where(eq(users.id, id)).returning();
      await audit(tx, actor, id, 'role_changed', { from: target.role, to: role });
      return updated;
    });
    return c.json({ user: toAdminUser(user) });
  })

  .post('/users/:id/disable', idParam, async (c) => {
    const actor = c.get('user');
    const { id } = c.req.valid('param');
    assertNotSelf(actor, id);
    const user = await withUserLocked(c.get('db'), id, async (tx, target) => {
      if (target.status !== 'active') throw conflict('このユーザーは無効化できる状態ではありません');
      await assertNotLastAdmin(tx, target);
      const [updated] = await tx.update(users).set({ status: 'disabled' }).where(eq(users.id, id)).returning();
      // セッションはリクエストのたびに状態を見て拒否されるが、使えないものは消しておく
      await tx.delete(sessions).where(eq(sessions.userId, id));
      await audit(tx, actor, id, 'disabled');
      return updated;
    });
    return c.json({ user: toAdminUser(user) });
  })

  .post('/users/:id/enable', idParam, async (c) => {
    const actor = c.get('user');
    const { id } = c.req.valid('param');
    const user = await withUserLocked(c.get('db'), id, async (tx, target) => {
      if (target.status !== 'disabled') throw conflict('このユーザーは有効化できる状態ではありません');
      const [updated] = await tx.update(users).set({ status: 'active' }).where(eq(users.id, id)).returning();
      await audit(tx, actor, id, 'enabled');
      return updated;
    });
    return c.json({ user: toAdminUser(user) });
  })

  /** 退会処理（匿名化、D26）：名前を「退会済みユーザー」にし、メールアドレスとパスワードを消す。記録は残す。元に戻せない */
  .post('/users/:id/withdraw', idParam, async (c) => {
    const actor = c.get('user');
    const { id } = c.req.valid('param');
    assertNotSelf(actor, id);
    const user = await withUserLocked(c.get('db'), id, async (tx, target) => {
      if (target.status === 'withdrawn') throw conflict('このユーザーはすでに退会しています');
      await assertNotLastAdmin(tx, target);
      const [updated] = await tx
        .update(users)
        .set({ status: 'withdrawn', name: WITHDRAWN_USER_NAME, email: null, passwordHash: null, withdrawnAt: new Date() })
        .where(eq(users.id, id))
        .returning();
      await tx.delete(sessions).where(eq(sessions.userId, id));
      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, id));
      // 招待にもメールアドレスが残っているので消す（招待した側の記録は操作履歴に残らないが、個人情報を残さない方を優先する）
      if (target.email) {
        await tx.delete(invitations).where(sql`lower(${invitations.email}) = lower(${target.email})`);
      }
      await audit(tx, actor, id, 'withdrawn');
      return updated;
    });
    return c.json({ user: toAdminUser(user) });
  })

  // ---------------------------------------------------------------- 招待
  .get('/invitations', async (c) => {
    const inviter = alias(users, 'inviter');
    const rows = await c
      .get('db')
      .select({ inv: invitations, invitedByName: inviter.name })
      .from(invitations)
      .innerJoin(inviter, eq(invitations.invitedBy, inviter.id))
      .orderBy(desc(invitations.createdAt))
      .limit(LIST_LIMIT);
    const now = Date.now();
    const body: AdminInvitation[] = rows.map(({ inv, invitedByName }) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: invitationStatus(inv, now),
      invitedByName,
      createdAt: inv.createdAt.toISOString(),
      expiresAt: inv.expiresAt.toISOString(),
    }));
    return c.json({ invitations: body });
  })

  .post('/invitations', validate('json', invitationInputSchema), async (c) => {
    const db = c.get('db');
    const actor = c.get('user');
    const { email, role } = c.req.valid('json');
    const [registered] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);
    if (registered) throw conflict('このメールアドレスはすでに登録されています');

    const token = newToken();
    const inv = await db.transaction(async (tx) => {
      // 同じアドレスへのまだ使われていない招待は取り消す（古いリンクを使えなくする）
      await tx
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(and(sql`lower(${invitations.email}) = ${email}`, isNull(invitations.usedAt), isNull(invitations.revokedAt)));
      const [created] = await tx
        .insert(invitations)
        .values({ tokenHash: sha256(token), email, role, invitedBy: actor.id, expiresAt: invitationExpiresAt() })
        .returning();
      return created;
    });

    try {
      await c.get('mailer').send(invitationMail(email, invitationUrl(c.get('appUrl'), c.req, token)));
    } catch (err) {
      console.error(err);
      // 届かない招待を残さない
      await db.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, inv.id));
      return c.json(errorBody('mail_failed', '招待メールを送れませんでした。しばらくしてからもう一度お試しください'), 502);
    }
    return c.json({ id: inv.id }, 201);
  })

  /** 再送：トークンを作り直して有効期限を48時間に戻し、メールを送り直す。古いリンクは使えなくなる */
  .post('/invitations/:id/resend', idParam, async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const [inv] = await db.select().from(invitations).where(eq(invitations.id, id)).limit(1);
    if (!inv) throw new HTTPException(404, { message: '招待が見つかりません' });
    const status = invitationStatus(inv);
    if (status === 'used' || status === 'revoked') throw conflict('この招待は再送できません');
    const token = newToken();
    await db
      .update(invitations)
      .set({ tokenHash: sha256(token), expiresAt: invitationExpiresAt() })
      .where(eq(invitations.id, id));
    try {
      await c.get('mailer').send(invitationMail(inv.email, invitationUrl(c.get('appUrl'), c.req, token)));
    } catch (err) {
      console.error(err);
      return c.json(errorBody('mail_failed', '招待メールを送れませんでした。しばらくしてからもう一度お試しください'), 502);
    }
    return c.json({ id });
  })

  .post('/invitations/:id/revoke', idParam, async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const [updated] = await db
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(and(eq(invitations.id, id), isNull(invitations.usedAt), isNull(invitations.revokedAt)))
      .returning({ id: invitations.id });
    if (!updated) throw conflict('この招待は取り消せません（登録済み・取り消し済み、または見つかりません）');
    return c.json({ id });
  })

  // ---------------------------------------------------------------- 操作履歴
  .get('/audit-logs', async (c) => {
    const actor = alias(users, 'actor');
    const target = alias(users, 'target');
    const rows = await c
      .get('db')
      .select({ log: auditLogs, actorName: actor.name, targetName: target.name })
      .from(auditLogs)
      .innerJoin(actor, eq(auditLogs.actorId, actor.id))
      .innerJoin(target, eq(auditLogs.targetUserId, target.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(LIST_LIMIT);
    const body: AuditLogEntry[] = rows.map(({ log, actorName, targetName }) => ({
      id: log.id,
      action: log.action,
      actorName,
      targetName,
      fromRole: log.fromRole,
      toRole: log.toRole,
      createdAt: log.createdAt.toISOString(),
    }));
    return c.json({ auditLogs: body });
  });
