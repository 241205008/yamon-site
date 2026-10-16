import { timingSafeEqual } from 'node:crypto';
import { setupInputSchema, type MeResponse, type SetupStatus } from '@yamon/shared';
import { count, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { hashPassword } from '../auth/password';
import { createSession, setSessionCookie, sha256 } from '../auth/session';
import { schema, type Db } from '../db/client';
import { errorBody } from '../errors';
import { validate } from '../validator';

const { users } = schema;

/** 初回セットアップを同時に2回行わせないためのロックの番号（routes/admin.ts の番号とは別） */
const SETUP_LOCK = 724_012;

async function userCount(db: Db) {
  const [{ n }] = await db.select({ n: count() }).from(users);
  return n;
}

/** 長さの違いや一致した文字数で時間が変わらないよう、ハッシュにそろえてから比べる */
function sameToken(input: string, expected: string) {
  return timingSafeEqual(Buffer.from(sha256(input), 'hex'), Buffer.from(sha256(expected), 'hex'));
}

/**
 * 初回セットアップ（MVP 3章、D18・D37）。ユーザーが1人もいないときだけ、最初の管理者を登録できる。
 * 登録には、サーバーの環境変数 SETUP_TOKEN と同じトークンが要る（公開直後に第三者が管理者になるのを防ぐ）
 */
export const setupRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const body: SetupStatus = { needed: (await userCount(c.get('db'))) === 0 };
    return c.json(body);
  })
  .post('/', validate('json', setupInputSchema), async (c) => {
    const expected = c.get('setupToken');
    if (!expected) {
      return c.json(
        errorBody('setup_unavailable', '初回セットアップが設定されていません（サーバーの SETUP_TOKEN）。デプロイした人に確認してください'),
        503,
      );
    }
    const { token, name, email, password } = c.req.valid('json');
    // ハッシュの計算は重いので、ロックの外で先に済ませる
    const passwordHash = await hashPassword(password);

    const db = c.get('db');
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${SETUP_LOCK})`);
      if ((await userCount(tx)) > 0) return { error: 'done' as const };
      if (!sameToken(token, expected)) return { error: 'token' as const };
      const [user] = await tx
        .insert(users)
        .values({ name, email, passwordHash, role: 'admin' })
        .returning({ id: users.id, name: users.name, email: users.email, role: users.role });
      return { user: { ...user, email: user.email! } };
    });

    if (outcome.error === 'done') {
      return c.json(errorBody('setup_done', '初回セットアップは済んでいます。ログインしてください'), 409);
    }
    if (outcome.error === 'token') {
      return c.json(errorBody('invalid_setup_token', 'セットアップ用トークンが正しくありません'), 403);
    }
    setSessionCookie(c, await createSession(db, outcome.user.id));
    const body: MeResponse = { user: outcome.user };
    return c.json(body, 201);
  });
