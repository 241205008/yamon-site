import {
  invitationAcceptInputSchema,
  invitationLookupInputSchema,
  type InvitationInfo,
  type MeResponse,
} from '@yamon/shared';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { hashPassword } from '../auth/password';
import { createSession, deleteSession, getSessionToken, setSessionCookie, sha256 } from '../auth/session';
import { schema, type Db } from '../db/client';
import { errorBody } from '../errors';
import { invitationStatus } from '../invitations';
import { validate } from '../validator';

const { invitations, users } = schema;

/** 招待リンクが使えない理由。リンクを開いた人に、管理者へ何を頼めばよいかが分かるように出す */
const UNUSABLE = {
  invalid: { status: 404, code: 'invitation_invalid', message: '招待リンクが正しくありません。受け取ったリンクをそのまま開いてください' },
  used: { status: 410, code: 'invitation_used', message: 'この招待リンクはすでに使われています。登録済みの場合はログインしてください' },
  expired: { status: 410, code: 'invitation_expired', message: 'この招待リンクは有効期限（48時間）が切れています。管理者にリンクを作り直してもらってください' },
  revoked: { status: 410, code: 'invitation_revoked', message: 'この招待は取り消されています。管理者に問い合わせてください' },
} as const;

type Unusable = keyof typeof UNUSABLE;

/** トークンから招待を探し、使えるか確かめる。行をロックするときはトランザクションの中で lock: true */
async function findUsable(db: Db, token: string, lock = false) {
  const query = db.select().from(invitations).where(eq(invitations.tokenHash, sha256(token))).limit(1);
  const [inv] = await (lock ? query.for('update') : query);
  if (!inv) return { error: 'invalid' as Unusable };
  const status = invitationStatus(inv);
  if (status !== 'pending') return { error: status as Unusable };
  return { inv };
}

// トークンは URL のパスに入れない（アクセスログに残さない）。本文の JSON で受け取る
export const invitationRoutes = new Hono<AppEnv>()
  .post('/lookup', validate('json', invitationLookupInputSchema), async (c) => {
    const result = await findUsable(c.get('db'), c.req.valid('json').token);
    if (result.error) {
      const e = UNUSABLE[result.error];
      return c.json(errorBody(e.code, e.message), e.status);
    }
    const body: InvitationInfo = {
      email: result.inv.email,
      role: result.inv.role,
      expiresAt: result.inv.expiresAt.toISOString(),
    };
    return c.json(body);
  })
  .post('/accept', validate('json', invitationAcceptInputSchema), async (c) => {
    const db = c.get('db');
    const { token, name, password } = c.req.valid('json');
    // ハッシュの計算は重いので、トランザクション（行のロック）の外で先に済ませる
    const passwordHash = await hashPassword(password);

    const outcome = await db.transaction(async (tx) => {
      const result = await findUsable(tx, token, true);
      if (result.error) return { error: result.error as Unusable | 'registered' };
      const { inv } = result;
      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = lower(${inv.email})`)
        .limit(1);
      if (existing) return { error: 'registered' as const };
      const [user] = await tx
        .insert(users)
        .values({ name, email: inv.email, passwordHash, role: inv.role })
        .returning({ id: users.id, name: users.name, email: users.email, role: users.role });
      await tx.update(invitations).set({ usedAt: new Date() }).where(eq(invitations.id, inv.id));
      return { user: { ...user, email: user.email! } };
    });

    if (outcome.error === 'registered') {
      return c.json(errorBody('conflict', 'このメールアドレスはすでに登録されています。ログインしてください'), 409);
    }
    if (outcome.error) {
      const e = UNUSABLE[outcome.error];
      return c.json(errorBody(e.code, e.message), e.status);
    }

    // 登録したらそのままログインする
    const previous = getSessionToken(c);
    if (previous) await deleteSession(db, previous);
    setSessionCookie(c, await createSession(db, outcome.user.id));
    const body: MeResponse = { user: outcome.user };
    return c.json(body, 201);
  });
