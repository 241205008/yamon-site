import { PASSWORD_RESET_TTL_MINUTES } from '@yamon/shared';
import { eq } from 'drizzle-orm';
import type { HonoRequest } from 'hono';
import { newToken, sha256 } from './auth/session';
import { schema, type Db } from './db/client';
import { appOrigin } from './invitations';

const { passwordResetTokens } = schema;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * パスワード再設定のトークンを作る（D41・D46）。そのユーザーの前のトークンは消す（最後に渡したリンクだけが使える）。
 * 本人の申請（メール）と、管理者の発行（画面に表示）の両方から使う
 */
export async function issueResetToken(db: Db | Tx, userId: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  await db.insert(passwordResetTokens).values({ tokenHash: sha256(token), userId, expiresAt });
  return { token, expiresAt };
}

/** トークンは URL のパスではなくクエリに入れ、画面が JSON の本文で API に送る（アクセスログに残さない、D36） */
export function resetUrl(appUrl: string | undefined, req: HonoRequest, token: string) {
  return `${appOrigin(appUrl, req)}/reset-password?token=${encodeURIComponent(token)}`;
}

export function resetMail(to: string, url: string) {
  return {
    to,
    subject: 'やもんサイトのパスワード再設定',
    text: [
      'やもんサイトのパスワード再設定のリンクをお送りします。',
      `次のリンクを開き、新しいパスワードを設定してください。リンクの有効期限は${PASSWORD_RESET_TTL_MINUTES}分で、1回だけ使えます。`,
      '',
      url,
      '',
      'このメールに心当たりがない場合は、何もせずに削除してください。パスワードは変わりません。',
    ].join('\n'),
  };
}
