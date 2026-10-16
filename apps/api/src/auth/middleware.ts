import { can, canActOn, type Permission, type SessionUser } from '@yamon/shared';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../app';
import { findSessionUser, getSessionToken } from './session';

/** requireAuth / requirePermission を通った後のハンドラーでは、c.get('user') が必ず入っている */
export type AuthedEnv = AppEnv & { Variables: { user: SessionUser } };

/**
 * Cookie のセッションからログイン中のユーザーを読む（1リクエストで1回だけ DB を見る）。
 * DB に触るのはログインが要るルートだけにする（/api/health では呼ばない、D31）
 */
export async function getCurrentUser(c: Context<AppEnv>): Promise<SessionUser | null> {
  const cached = c.get('user');
  if (cached !== undefined) return cached;
  const token = getSessionToken(c);
  const user = token ? await findSessionUser(c.get('db'), token) : null;
  c.set('user', user);
  return user;
}

/** AuthedEnv の Context を、ユーザーを調べる前の型（AppEnv）として扱う */
const asAppContext = (c: Context<AuthedEnv>) => c as unknown as Context<AppEnv>;

const unauthorized = () => new HTTPException(401, { message: 'ログインしてください' });
const forbidden = () => new HTTPException(403, { message: 'この操作をする権限がありません' });

/** ログイン必須。未ログイン・期限切れ・無効化・退会したユーザーは 401 */
export const requireAuth = createMiddleware<AuthedEnv>(async (c, next) => {
  if (!(await getCurrentUser(asAppContext(c)))) throw unauthorized();
  await next();
});

/**
 * ログインしていて、その役割に permission があるときだけ通す（対応表は packages/shared の PERMISSIONS）。
 * 未ログインは 401、権限がなければ 403。
 *
 *   app.post('/admin/map-data/refresh', requirePermission('mapData.update'), (c) => { const user = c.get('user'); ... })
 */
export const requirePermission = (permission: Permission) =>
  createMiddleware<AuthedEnv>(async (c, next) => {
    const user = await getCurrentUser(asAppContext(c));
    if (!user) throw unauthorized();
    if (!can(user.role, permission)) throw forbidden();
    await next();
  });

/**
 * 作成者が決まっているもの（記録・観察会）の編集・削除で、作成者本人か（または any の権限があるか）を確かめる。
 * 対象を DB から読んだ後で、ハンドラーの中で呼ぶ。だめなら 403 を投げる
 *
 *   assertCanActOn(c.get('user'), record.userId, 'records.editOwn')
 *   assertCanActOn(c.get('user'), event.createdBy, 'events.editOwn', 'events.editAny')
 */
export function assertCanActOn(user: SessionUser, ownerId: string | null, own: Permission, any?: Permission) {
  if (!canActOn(user, ownerId, own, any)) throw forbidden();
}
