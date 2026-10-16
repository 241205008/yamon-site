import { AlertTriangle, CheckCircle2, Clock, Copy, Mail, Shield, Trash2, UserPlus, Users, XCircle } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { BackBar, Card, ErrorText, inputClass, Modal, PageBackground, StatCard } from '../components/ui';
import {
  canRevertTransfer,
  createInvitation,
  deleteInvitation,
  invitationStatus,
  resendInvitation,
  setUserActive,
  StoreError,
  transferAdmin,
  useDb,
} from '../lib/store';
import { useCurrentUser } from '../lib/auth';
import { formatRemaining, isoToJstDate, isoToJstDateTime } from '@yamon/shared';
import type { Invitation, InvitationStatus, User } from '../lib/types';

const toMessage = (e: unknown) => (e instanceof StoreError ? e.message : '処理に失敗しました');

export function inviteUrl(token: string) {
  return `${window.location.origin}/login?invite=${encodeURIComponent(token)}`;
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function AdminPage() {
  const db = useDb();
  const me = useCurrentUser()!;
  const now = useNow();
  const [transferTarget, setTransferTarget] = useState<User | null>(null);
  const [userError, setUserError] = useState<string | null>(null);

  const pendingCount = db.invitations.filter((i) => invitationStatus(i, now) === 'pending').length;
  const userName = (id: string) => db.users.find((u) => u.id === id)?.name ?? '（不明なユーザー）';

  const toggleActive = (u: User) => {
    setUserError(null);
    try {
      setUserActive(me.id, u.id, !u.isActive);
    } catch (e) {
      setUserError(toMessage(e));
    }
  };

  return (
    <PageBackground tone="purple">
      <BackBar to="/" label="ホームに戻る" title="管理者画面" />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        {db.transfers.length > 0 && (
          <Card className="p-6">
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              管理者権限の移譲履歴です。移譲から1時間以内であれば、移譲元のユーザーがホーム画面から取り消せます。
            </div>
            <h2 className="mb-3 text-lg font-bold text-gray-900">管理者移譲履歴</h2>
            <ul className="space-y-2">
              {db.transfers.map((t) => {
                const revertible = canRevertTransfer(t, now);
                return (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 px-4 py-3 text-sm">
                    <span className="text-gray-800">
                      {userName(t.fromUserId)} → <span className="font-bold">{userName(t.toUserId)}</span>
                      <span className="ml-3 text-gray-500">{isoToJstDateTime(t.transferredAt)}</span>
                    </span>
                    {t.revertedAt ? (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">取り消し済み</span>
                    ) : revertible ? (
                      <span className="rounded bg-yellow-100 px-2 py-0.5 font-mono text-xs text-yellow-800">
                        取り消し期限まで {formatRemaining(new Date(t.revertDeadline).getTime() - now)}
                      </span>
                    ) : (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">確定</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <InvitationPanel actorId={me.id} invitations={db.invitations} now={now} />

          <Card className="p-6">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900">
              <Users className="h-5 w-5 text-blue-600" />
              登録済みユーザー
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-sm font-normal text-blue-800">
                {db.users.length}名
              </span>
            </h2>
            <p className="mb-4 flex items-start gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2.5 text-sm text-purple-800">
              <Shield className="mt-0.5 h-4 w-4 shrink-0" />
              「管理者に」ボタンで他のユーザーに管理者権限を移譲できます。移譲後1時間以内は取り消し可能です。
            </p>
            <div className="mb-3">
              <ErrorText message={userError} />
            </div>
            <ul className="space-y-3">
              {db.users.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-gray-900">{u.name}</span>
                      {u.role === 'admin' ? (
                        <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700">管理者</span>
                      ) : (
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">ユーザー</span>
                      )}
                      {!u.isActive && (
                        <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">無効</span>
                      )}
                      {u.id === me.id && <span className="text-xs text-gray-500">（あなた）</span>}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{u.email}</p>
                  </div>
                  {u.role === 'user' && (
                    <div className="flex gap-2">
                      {u.isActive && (
                        <button
                          type="button"
                          onClick={() => setTransferTarget(u)}
                          className="flex items-center gap-1 rounded-lg bg-purple-100 px-3 py-1.5 text-sm text-purple-700 hover:bg-purple-200"
                        >
                          <Shield className="h-3.5 w-3.5" />
                          管理者に
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleActive(u)}
                        className={`rounded-lg px-3 py-1.5 text-sm ${
                          u.isActive
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                      >
                        {u.isActive ? '無効化' : '有効化'}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="総ユーザー数" value={db.users.length} color="blue" />
          <StatCard label="有効ユーザー" value={db.users.filter((u) => u.isActive).length} color="green" />
          <StatCard label="招待中" value={pendingCount} color="yellow" />
          <StatCard label="管理者数" value={db.users.filter((u) => u.role === 'admin').length} color="purple" />
        </div>
      </main>

      {transferTarget && (
        <TransferModal actorId={me.id} target={transferTarget} onClose={() => setTransferTarget(null)} />
      )}
    </PageBackground>
  );
}

const STATUS_BADGE: Record<InvitationStatus, { label: string; className: string; icon: typeof Clock }> = {
  pending: { label: '招待中', className: 'bg-yellow-100 text-yellow-800', icon: Clock },
  accepted: { label: '承認済み', className: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  expired: { label: '期限切れ', className: 'bg-gray-100 text-gray-600', icon: XCircle },
};

function InvitationPanel({ actorId, invitations, now }: { actorId: string; invitations: Invitation[]; now: number }) {
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<Invitation | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setIssued(createInvitation(actorId, name, email));
      setName('');
      setEmail('');
      setFormOpen(false);
    } catch (err) {
      setError(toMessage(err));
    }
  };

  const act = (fn: () => void) => {
    setError(null);
    try {
      fn();
    } catch (err) {
      setError(toMessage(err));
    }
  };

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <UserPlus className="h-5 w-5 text-purple-600" />
          新規ユーザー招待
        </h2>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="rounded-lg bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-700"
        >
          {formOpen ? '閉じる' : '招待を送る'}
        </button>
      </div>

      {formOpen && (
        <form onSubmit={submit} className="mb-6 space-y-3 rounded-lg border border-purple-200 bg-purple-50 p-4">
          <div>
            <label htmlFor="inv-name" className="mb-1 block text-sm text-gray-700">名前</label>
            <input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="山田 太郎" className={`${inputClass} bg-white`} />
          </div>
          <div>
            <label htmlFor="inv-email" className="mb-1 block text-sm text-gray-700">メールアドレス</label>
            <input
              id="inv-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              className={`${inputClass} bg-white`}
            />
          </div>
          <button type="submit" className="w-full rounded-lg bg-purple-600 py-2.5 text-white hover:bg-purple-700">
            招待を作成
          </button>
        </form>
      )}

      <div className="mb-3">
        <ErrorText message={error} />
      </div>

      {issued && <IssuedInvitation invitation={issued} onClose={() => setIssued(null)} />}

      <h3 className="mb-3 text-lg font-bold text-gray-900">招待履歴</h3>
      {invitations.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">まだ招待はありません</p>
      ) : (
        <ul className="space-y-3">
          {invitations.map((inv) => {
            const status = invitationStatus(inv, now);
            const badge = STATUS_BADGE[status];
            const Icon = badge.icon;
            return (
              <li key={inv.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Mail className="h-4 w-4 shrink-0 text-gray-500" />
                      <span className="break-all text-gray-900">{inv.email}</span>
                      <span className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs ${badge.className}`}>
                        <Icon className="h-3 w-3" />
                        {badge.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">招待日: {isoToJstDate(inv.invitedAt)}</p>
                    {status === 'pending' && (
                      <>
                        <p className="mt-1 text-xs break-all text-gray-500">招待トークン: {inv.token}</p>
                        <p className="text-xs text-gray-500">有効期限: {isoToJstDateTime(inv.expiresAt)}</p>
                        <button
                          type="button"
                          onClick={() => setIssued(inv)}
                          className="mt-1 text-xs text-purple-700 hover:underline"
                        >
                          招待リンクを表示
                        </button>
                      </>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {status !== 'accepted' && (
                      <button
                        type="button"
                        onClick={() => act(() => setIssued(resendInvitation(actorId, inv.id)))}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        再送信
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`${inv.email} への招待を削除しますか？`)) {
                          act(() => deleteInvitation(actorId, inv.id));
                          if (issued?.id === inv.id) setIssued(null);
                        }
                      }}
                      className="rounded p-1 text-red-600 hover:bg-red-50"
                      aria-label="招待を削除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** バックエンドがないため、招待リンクを表示して管理者が相手に送る */
function IssuedInvitation({ invitation, onClose }: { invitation: Invitation; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = inviteUrl(invitation.token);
  const mailto = `mailto:${invitation.email}?subject=${encodeURIComponent('やもんサイトへの招待')}&body=${encodeURIComponent(
    `${invitation.name ? `${invitation.name} さん\n\n` : ''}やもんサイトに招待しました。\n48時間以内に次のリンクから登録してください。\n\n${url}\n`,
  )}`;

  return (
    <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-green-800">{invitation.email} への招待リンク（48時間有効）</p>
        <button type="button" onClick={onClose} className="text-xs text-green-700 hover:underline">
          閉じる
        </button>
      </div>
      <p className="mt-2 rounded border border-green-200 bg-white px-2 py-1.5 font-mono text-xs break-all text-gray-800">{url}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
          className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-green-800 hover:bg-green-100"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? 'コピーしました' : 'リンクをコピー'}
        </button>
        <a href={mailto} className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-white hover:bg-green-700">
          <Mail className="h-3.5 w-3.5" />
          メールアプリで送る
        </a>
      </div>
    </div>
  );
}

function TransferModal({ actorId, target, onClose }: { actorId: string; target: User; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title="管理者権限の移譲">
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">移譲先</p>
          <p className="mt-1 font-bold text-gray-900">{target.name}</p>
          <p className="text-sm text-gray-600">{target.email}</p>
        </div>
        <ul className="list-disc space-y-1 rounded-lg border border-yellow-300 bg-yellow-50 py-3 pr-4 pl-8 text-sm text-yellow-900">
          <li>移譲すると、あなたは一般ユーザーになり、管理者画面に入れなくなります。</li>
          <li>移譲から1時間以内であれば、あなたがホーム画面から取り消せます。</li>
          <li>1時間を過ぎると取り消せません。</li>
        </ul>
        <ErrorText message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200">
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                transferAdmin(actorId, target.id);
                onClose();
              } catch (e) {
                setError(toMessage(e));
              }
            }}
            className="rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
          >
            移譲する
          </button>
        </div>
      </div>
    </Modal>
  );
}
