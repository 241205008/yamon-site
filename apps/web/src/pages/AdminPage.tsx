import {
  AUDIT_ACTION_LABELS,
  can,
  INVITATION_STATUS_LABELS,
  INVITATION_TTL_HOURS,
  isoToJstDate,
  isoToJstDateTime,
  ROLE_LABELS,
  ROLES,
  type AdminInvitation,
  type AdminUser,
  type AuditLogEntry,
  type InvitationStatus,
  type Role,
} from '@yamon/shared';
import { CheckCircle2, Clock, History, Mail, RotateCw, Trash2, UserPlus, Users, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { MapDataPanel } from '../components/MapDataPanel';
import { BackBar, Card, ErrorText, inputClass, Modal, PageBackground, StatCard } from '../components/ui';
import {
  changeRole,
  createInvitation,
  disableUser,
  enableUser,
  fetchAuditLogs,
  fetchInvitations,
  fetchUsers,
  resendInvitation,
  revokeInvitation,
  withdrawUser,
} from '../lib/admin';
import { ApiError } from '../lib/api';
import { getCurrentUser, refresh, useCurrentUser } from '../lib/auth';

const toMessage = (e: unknown) => (e instanceof ApiError ? e.message : '処理に失敗しました');

const ROLE_BADGE: Record<Role, string> = {
  admin: 'bg-purple-100 text-purple-700',
  officer: 'bg-blue-100 text-blue-700',
  member: 'bg-gray-100 text-gray-700',
  viewer: 'bg-amber-100 text-amber-800',
};

interface AdminData {
  users: AdminUser[];
  invitations: AdminInvitation[];
  auditLogs: AuditLogEntry[];
}

/** 管理者画面のデータを API から読む。操作の後は reload で読み直す */
function useAdminData() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const [users, invitations, auditLogs] = await Promise.all([fetchUsers(), fetchInvitations(), fetchAuditLogs()]);
      setData({ users, invitations, auditLogs });
      setLoadError(null);
    } catch (e) {
      setLoadError(toMessage(e));
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, loadError, reload };
}

export function AdminPage() {
  const me = useCurrentUser();
  const { data, loadError, reload } = useAdminData();

  return (
    <PageBackground tone="purple">
      <BackBar to="/" label="ホームに戻る" title="管理者画面" />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        {loadError && (
          <div className="flex flex-wrap items-center gap-3">
            <ErrorText message={loadError} />
            <button type="button" onClick={() => void reload()} className="text-sm text-purple-700 hover:underline">
              読み込み直す
            </button>
          </div>
        )}
        {!data ? (
          !loadError && <p className="py-12 text-center text-gray-500">読み込み中…</p>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <InvitationPanel invitations={data.invitations} onChanged={reload} />
              <UserPanel users={data.users} onChanged={reload} />
            </div>

            <AuditLogPanel logs={data.auditLogs} />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="登録ユーザー" value={data.users.filter((u) => u.status !== 'withdrawn').length} color="blue" />
              <StatCard label="ログインできるユーザー" value={data.users.filter((u) => u.status === 'active').length} color="green" />
              <StatCard label="招待中" value={data.invitations.filter((i) => i.status === 'pending').length} color="yellow" />
              <StatCard
                label="管理者数"
                value={data.users.filter((u) => u.role === 'admin' && u.status === 'active').length}
                color="purple"
              />
            </div>
          </>
        )}

        {/* 地図データの更新は管理者だけ（API でも同じ権限を確かめる、D34） */}
        {me && can(me.role, 'mapData.update') && <MapDataPanel />}
      </main>
    </PageBackground>
  );
}

// ---------------------------------------------------------------------------
// 招待
// ---------------------------------------------------------------------------

const INVITATION_BADGE: Record<InvitationStatus, { className: string; icon: typeof Clock }> = {
  pending: { className: 'bg-yellow-100 text-yellow-800', icon: Clock },
  used: { className: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  expired: { className: 'bg-gray-100 text-gray-600', icon: XCircle },
  revoked: { className: 'bg-gray-100 text-gray-600', icon: XCircle },
};

function InvitationPanel({ invitations, onChanged }: { invitations: AdminInvitation[]; onChanged: () => Promise<void> }) {
  const [formOpen, setFormOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
      setNotice(done);
      await onChanged();
      return true;
    } catch (e) {
      setError(toMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const sentTo = email.trim();
    if (await run(() => createInvitation({ email: sentTo, role }), `${sentTo} に招待メールを送りました`)) {
      setEmail('');
      setRole('member');
      setFormOpen(false);
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
          <div>
            <label htmlFor="inv-role" className="mb-1 block text-sm text-gray-700">役割</label>
            <select
              id="inv-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className={`${inputClass} bg-white`}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-gray-600">
            招待メールが届きます。リンクの有効期限は{INVITATION_TTL_HOURS}時間で、1回だけ使えます。
          </p>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-purple-600 py-2.5 text-white hover:bg-purple-700 disabled:opacity-60"
          >
            {busy ? '送信中…' : '招待メールを送る'}
          </button>
        </form>
      )}

      <div className="mb-3 space-y-2">
        <ErrorText message={error} />
        {notice && (
          <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            {notice}
          </p>
        )}
      </div>

      <h3 className="mb-3 text-lg font-bold text-gray-900">招待履歴</h3>
      {invitations.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">まだ招待はありません</p>
      ) : (
        <ul className="space-y-3">
          {invitations.map((inv) => {
            const badge = INVITATION_BADGE[inv.status];
            const Icon = badge.icon;
            const open = inv.status === 'pending' || inv.status === 'expired';
            return (
              <li key={inv.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Mail className="h-4 w-4 shrink-0 text-gray-500" />
                      <span className="break-all text-gray-900">{inv.email}</span>
                      <span className={`rounded px-2 py-0.5 text-xs ${ROLE_BADGE[inv.role]}`}>{ROLE_LABELS[inv.role]}</span>
                      <span className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs ${badge.className}`}>
                        <Icon className="h-3 w-3" />
                        {INVITATION_STATUS_LABELS[inv.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      招待日: {isoToJstDate(inv.createdAt)}（{inv.invitedByName}）
                    </p>
                    {inv.status === 'pending' && (
                      <p className="text-xs text-gray-500">有効期限: {isoToJstDateTime(inv.expiresAt)}</p>
                    )}
                  </div>
                  {open && (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => resendInvitation(inv.id), `${inv.email} に招待メールを送り直しました`)}
                        className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 disabled:opacity-60"
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                        再送
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`${inv.email} への招待を取り消しますか？送ったリンクは使えなくなります。`)) {
                            void run(() => revokeInvitation(inv.id), `${inv.email} への招待を取り消しました`);
                          }
                        }}
                        className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-60"
                        aria-label="招待を取り消す"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ユーザー
// ---------------------------------------------------------------------------

function UserPanel({ users, onChanged }: { users: AdminUser[]; onChanged: () => Promise<void> }) {
  const me = useCurrentUser()!;
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<AdminUser | null>(null);

  const run = async (u: AdminUser, fn: () => Promise<unknown>) => {
    setError(null);
    setBusyId(u.id);
    try {
      await fn();
      // 自分の役割を変えたら、ログイン中のユーザーも読み直す。管理者でなくなれば、この画面から出るので読み直さない
      if (u.id === me.id) {
        await refresh();
        const now = getCurrentUser();
        if (!now || !can(now.role, 'users.manage')) return;
      }
      await onChanged();
    } catch (e) {
      setError(toMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const onRoleChange = (u: AdminUser, role: Role) => {
    if (u.id === me.id && u.role === 'admin' && role !== 'admin') {
      if (!window.confirm('自分を管理者以外にすると、この画面に入れなくなります。よろしいですか？')) return;
    }
    void run(u, () => changeRole(u.id, role));
  };

  const listed = users.filter((u) => u.status !== 'withdrawn');
  const withdrawn = users.filter((u) => u.status === 'withdrawn');

  return (
    <Card className="p-6">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900">
        <Users className="h-5 w-5 text-blue-600" />
        登録済みユーザー
        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-sm font-normal text-blue-800">{listed.length}名</span>
      </h2>
      <p className="mb-4 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2.5 text-sm text-purple-800">
        役割を選ぶと、すぐに変わります。管理者は複数人にできますが、最後の1人の管理者は降格・無効化・退会させられません。
      </p>
      <div className="mb-3">
        <ErrorText message={error} />
      </div>
      <ul className="space-y-3">
        {listed.map((u) => {
          const busy = busyId === u.id;
          const isMe = u.id === me.id;
          return (
            <li key={u.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-gray-900">{u.name}</span>
                <span className={`rounded px-2 py-0.5 text-xs ${ROLE_BADGE[u.role]}`}>{ROLE_LABELS[u.role]}</span>
                {u.status === 'disabled' && <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">無効化中</span>}
                {isMe && <span className="text-xs text-gray-500">（あなた）</span>}
              </div>
              <p className="mt-1 text-sm break-all text-gray-600">{u.email}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`role-${u.id}`}>
                  {u.name} の役割
                </label>
                <select
                  id={`role-${u.id}`}
                  value={u.role}
                  disabled={busy}
                  onChange={(e) => onRoleChange(u, e.target.value as Role)}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
                {!isMe && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void run(u, () => (u.status === 'active' ? disableUser(u.id) : enableUser(u.id)))}
                      className={`rounded-lg px-3 py-1.5 text-sm disabled:opacity-60 ${
                        u.status === 'active'
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}
                    >
                      {u.status === 'active' ? '無効化' : '有効化'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setWithdrawTarget(u)}
                      className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 disabled:opacity-60"
                    >
                      退会処理
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {withdrawn.length > 0 && (
        <p className="mt-4 text-sm text-gray-500">退会済みユーザー：{withdrawn.length}名（記録は「退会済みユーザー」の記録として残っています）</p>
      )}

      {withdrawTarget && (
        <WithdrawModal
          target={withdrawTarget}
          onClose={() => setWithdrawTarget(null)}
          onConfirm={async () => {
            await withdrawUser(withdrawTarget.id);
            setWithdrawTarget(null);
            await onChanged();
          }}
        />
      )}
    </Card>
  );
}

/** 退会処理の確認。元に戻せないので、何が消えて何が残るかを示してから実行する */
function WithdrawModal({
  target,
  onClose,
  onConfirm,
}: {
  target: AdminUser;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="退会処理">
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="font-bold text-gray-900">{target.name}</p>
          <p className="text-sm break-all text-gray-600">{target.email}</p>
        </div>
        <ul className="list-disc space-y-1 rounded-lg border border-yellow-300 bg-yellow-50 py-3 pr-4 pl-8 text-sm text-yellow-900">
          <li>このユーザーはログインできなくなります。</li>
          <li>名前とメールアドレスを削除します。</li>
          <li>観察記録は残り、記録者は「退会済みユーザー」と表示されます。</li>
          <li>
            <span className="font-bold">元に戻せません。</span>
            記録を見られるようにしておきたい場合は、退会ではなく役割を「OB・OG」にしてください。
          </li>
        </ul>
        <ErrorText message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200">
            キャンセル
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setError(null);
              setBusy(true);
              try {
                await onConfirm();
              } catch (e) {
                setError(toMessage(e));
                setBusy(false);
              }
            }}
            className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? '処理中…' : '退会処理をする'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// 操作履歴
// ---------------------------------------------------------------------------

function AuditLogPanel({ logs }: { logs: AuditLogEntry[] }) {
  return (
    <Card className="p-6">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900">
        <History className="h-5 w-5 text-gray-600" />
        操作履歴
      </h2>
      {logs.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">まだ操作はありません</p>
      ) : (
        <ul className="divide-y divide-gray-100 text-sm">
          {logs.map((log) => (
            <li key={log.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
              <span className="text-gray-500">{isoToJstDateTime(log.createdAt)}</span>
              <span className="text-gray-900">
                {log.targetName} の{AUDIT_ACTION_LABELS[log.action]}
                {log.action === 'role_changed' && log.fromRole && log.toRole && (
                  <>
                    （{ROLE_LABELS[log.fromRole]} → {ROLE_LABELS[log.toRole]}）
                  </>
                )}
              </span>
              <span className="text-gray-500">操作した人：{log.actorName}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
