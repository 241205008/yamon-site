import { setupInputSchema, type MeResponse, type SetupStatus } from '@yamon/shared';
import { and, count, eq, gt, lte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { hashPassword } from '../auth/password';
import { createSession, sameSecret, setSessionCookie, sha256 } from '../auth/session';
import { schema, type Db } from '../db/client';
import { errorBody } from '../errors';
import { validate } from '../validator';

const { users, loginFailures } = schema;

/** 初回セットアップを同時に2回行わせないためのロックの番号（routes/admin.ts の番号とは別） */
const SETUP_LOCK = 724_012;

/**
 * トークンの総当たり対策：15分に MAX_SETUP_ATTEMPTS 回まで。ログインの失敗と同じ表に、
 * メールアドレスの代わりにこの固定のキーで数える（D33 と同じ数え方）
 */
const SETUP_ATTEMPT_KEY = sha256('initial-setup');
const SETUP_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const MAX_SETUP_ATTEMPTS = 10;

async function userCount(db: Db) {
  const [{ n }] = await db.select({ n: count() }).from(users);
  return n;
}

/**
 * 初回セットアップ（MVP 3章、D18・D37）。ユーザーが1人もいないときだけ、最初の管理者を登録できる。
 * 登録には、サーバーの環境変数 SETUP_TOKEN と同じトークンが要る（公開直後に第三者が管理者になるのを防ぐ）
 */
export const setupRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const body: SetupStatus = { needed: (await userCount(c.get('db'))) === 0, available: Boolean(c.get('setupToken')) };
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
    const db = c.get('db');
    const done = () => c.json(errorBody('setup_done', '初回セットアップは済んでいます。ログインしてください'), 409);
    // 済んでいれば、トークンも数えずに断る（重い処理をさせない）
    if ((await userCount(db)) > 0) return done();

    // 試行を先に1行記録してから数える（同時に大量に送られても、数える前にすり抜けない。D33）
    const windowStart = new Date(Date.now() - SETUP_ATTEMPT_WINDOW_MS);
    await db.delete(loginFailures).where(lte(loginFailures.createdAt, windowStart));
    await db.insert(loginFailures).values({ emailHash: SETUP_ATTEMPT_KEY });
    const [{ attempts }] = await db
      .select({ attempts: count() })
      .from(loginFailures)
      .where(and(eq(loginFailures.emailHash, SETUP_ATTEMPT_KEY), gt(loginFailures.createdAt, windowStart)));
    if (attempts > MAX_SETUP_ATTEMPTS) {
      return c.json(
        errorBody('too_many_attempts', '試行が続いたため、一時的に受け付けていません。15分ほど待ってからやり直してください'),
        429,
      );
    }
    if (!sameSecret(token, expected)) {
      return c.json(errorBody('invalid_setup_token', 'セットアップ用トークンが正しくありません'), 403);
    }

    // トークンが正しいときだけ、重いハッシュを計算する（ロックの外で）
    const passwordHash = await hashPassword(password);
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${SETUP_LOCK})`);
      if ((await userCount(tx)) > 0) return { error: 'done' as const };
      const [user] = await tx
        .insert(users)
        .values({ name, email, passwordHash, role: 'admin' })
        .returning({ id: users.id, name: users.name, email: users.email, role: users.role });
      return { user: { ...user, email: user.email! } };
    });

    if (outcome.error) return done();
    await db.delete(loginFailures).where(eq(loginFailures.emailHash, SETUP_ATTEMPT_KEY));
    setSessionCookie(c, await createSession(db, outcome.user.id));
    const body: MeResponse = { user: outcome.user };
    return c.json(body, 201);
  });
