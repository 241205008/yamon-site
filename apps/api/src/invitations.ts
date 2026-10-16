import { INVITATION_TTL_HOURS, type InvitationStatus } from '@yamon/shared';
import type { HonoRequest } from 'hono';
import type { schema } from './db/client';

type InvitationRow = typeof schema.invitations.$inferSelect;

/** 招待の状態。取り消し・使用済みを期限切れより先に見る */
export function invitationStatus(
  inv: Pick<InvitationRow, 'usedAt' | 'revokedAt' | 'expiresAt'>,
  now = Date.now(),
): InvitationStatus {
  if (inv.usedAt) return 'used';
  if (inv.revokedAt) return 'revoked';
  if (inv.expiresAt.getTime() <= now) return 'expired';
  return 'pending';
}

export const invitationExpiresAt = () => new Date(Date.now() + INVITATION_TTL_HOURS * 60 * 60 * 1000);

/**
 * メールに入れるリンクの起点。APP_URL があればそれを使い、なければ画面からのリクエストの Origin を使う
 * （画面と API は同じオリジン、D15）
 */
export function appOrigin(appUrl: string | undefined, req: HonoRequest): string {
  if (appUrl) return appUrl.replace(/\/+$/, '');
  return req.header('origin') ?? new URL(req.url).origin;
}

export function invitationUrl(appUrl: string | undefined, req: HonoRequest, token: string) {
  return `${appOrigin(appUrl, req)}/login?invite=${encodeURIComponent(token)}`;
}

export function invitationMail(to: string, url: string) {
  return {
    to,
    subject: 'やもんサイトへの招待',
    text: [
      'やもんサイト（生き物観察記録）に招待されました。',
      `次のリンクを開き、名前とパスワードを設定して登録してください。リンクの有効期限は${INVITATION_TTL_HOURS}時間で、1回だけ使えます。`,
      '',
      url,
      '',
      'このメールに心当たりがない場合は、何もせずに削除してください。',
    ].join('\n'),
  };
}
