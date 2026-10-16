import { z } from 'zod';
import type { Role } from './master';

/** ログインしたままでいられる最長の時間（MVP 2章「ログイン」） */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/** パスワードの長さ。上限は、極端に長い入力でハッシュ計算に時間をかけさせないため */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** メールアドレスは前後の空白を除き、小文字にそろえる（DB でも大文字・小文字を区別しない、D30） */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('メールアドレスの形式が正しくありません').max(254));

export const loginInputSchema = z.object({
  email: emailSchema,
  // ログインでは長さの下限を見ない（ルールを変えても、前のルールで作ったパスワードで入れるように）
  password: z.string().min(1, '入力してください').max(MAX_PASSWORD_LENGTH),
});
export type LoginInput = z.input<typeof loginInputSchema>;

/** 新しく決めるパスワード（登録・初回セットアップ・再設定） */
export const newPasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください`)
  .max(MAX_PASSWORD_LENGTH, `パスワードは${MAX_PASSWORD_LENGTH}文字以下にしてください`);

/** ログイン中のユーザー（GET /api/auth/me・POST /api/auth/login の応答） */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface MeResponse {
  user: SessionUser | null;
}

/** パスワード再設定のリンクの有効期限（MVP 2章「ログイン」） */
export const PASSWORD_RESET_TTL_MINUTES = 60;

/** 再設定メールを送ってもらう（POST /api/password-reset/request） */
export const passwordResetRequestSchema = z.object({ email: emailSchema });
export type PasswordResetRequestInput = z.input<typeof passwordResetRequestSchema>;

/** 再設定リンクのトークンで新しいパスワードを決める（POST /api/password-reset/confirm） */
export const passwordResetConfirmSchema = z.object({
  token: z.string().trim().min(1, '再設定のリンクが正しくありません').max(200),
  password: newPasswordSchema,
});
export type PasswordResetConfirmInput = z.input<typeof passwordResetConfirmSchema>;
