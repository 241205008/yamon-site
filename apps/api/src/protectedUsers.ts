import { idSchema } from '@yamon/shared';

/**
 * 環境変数 PROTECTED_USER_IDS（カンマ区切りのユーザー ID）を読む（D51）。
 * 空や未設定なら空の配列（守らない）。UUID でない値があれば例外にする（書き間違いで守りが外れたまま動かさない）
 */
export function parseProtectedUserIds(value: string | undefined): string[] {
  const ids = (value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s !== '');
  const invalid = ids.filter((id) => !idSchema.safeParse(id).success);
  if (invalid.length > 0) {
    throw new Error(`PROTECTED_USER_IDS にユーザー ID（UUID）でない値があります（${invalid.length}個）`);
  }
  return [...new Set(ids)];
}
