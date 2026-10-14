import { Calendar, Database as DbIcon, List, LogOut, Map as MapIcon, MapPin, Pencil, Shield, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CreatureManager } from '../components/CreatureManager';
import { EventForm } from '../components/EventForm';
import { RecordCard } from '../components/RecordCard';
import { RecordForm } from '../components/RecordForm';
import { ErrorText, PageBackground } from '../components/ui';
import { compareRecordsDesc, useCreatureMap } from '../lib/selectors';
import {
  addRecord,
  canRevertTransfer,
  createEvent,
  deleteRecord,
  logout,
  revertTransfer,
  StoreError,
  updateRecord,
  useCurrentUser,
  useDb,
} from '../lib/store';
import { formatRemaining } from '@yamon/shared';
import type { ObservationRecord } from '../lib/types';

const RECENT_LIMIT = 10;

const navBtn = 'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-white transition-colors';

export function MainPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const navigate = useNavigate();
  const creatureMap = useCreatureMap(db);

  const [showEventForm, setShowEventForm] = useState(false);
  const [showCreatures, setShowCreatures] = useState(false);
  const [editing, setEditing] = useState<ObservationRecord | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const recent = useMemo(
    () => [...db.records].sort(compareRecordsDesc).slice(0, RECENT_LIMIT),
    [db.records],
  );

  const startEdit = (r: ObservationRecord) => {
    setEditing(r);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const remove = (r: ObservationRecord) => {
    setListError(null);
    if (!window.confirm('この記録を削除しますか？')) return;
    try {
      deleteRecord(user.id, r.id);
      if (editing?.id === r.id) setEditing(null);
    } catch (e) {
      setListError(e instanceof StoreError ? e.message : '削除に失敗しました');
    }
  };

  return (
    <PageBackground>
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-600">
              <DbIcon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl leading-tight font-bold text-gray-900">やもんサイト</h1>
              <p className="text-sm text-gray-600">生き物観察記録システム</p>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-2">
            {user.role === 'admin' && (
              <Link to="/admin" className={`${navBtn} bg-purple-600 hover:bg-purple-700`}>
                <Shield className="h-4 w-4" />
                管理者画面
              </Link>
            )}
            <Link to="/event-list" className={`${navBtn} bg-orange-600 hover:bg-orange-700`}>
              <Calendar className="h-4 w-4" />
              観察会一覧
            </Link>
            <button
              type="button"
              onClick={() => setShowCreatures((v) => !v)}
              aria-pressed={showCreatures}
              className={`${navBtn} bg-purple-600 hover:bg-purple-700 ${showCreatures ? 'ring-2 ring-purple-300' : ''}`}
            >
              <List className="h-4 w-4" />
              生き物管理
            </button>
            <Link to="/locations" className={`${navBtn} bg-blue-600 hover:bg-blue-700`}>
              <MapPin className="h-4 w-4" />
              場所別の生き物
            </Link>
            <Link to="/map" className={`${navBtn} bg-green-600 hover:bg-green-700`}>
              <MapIcon className="h-4 w-4" />
              マップを見る
            </Link>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <LogOut className="h-4 w-4" />
              ログアウト
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <RevertTransferBanner userId={user.id} />

        {!showEventForm ? (
          <button
            type="button"
            onClick={() => setShowEventForm(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 py-4 text-lg font-bold text-white shadow-md transition-colors hover:bg-orange-700"
          >
            <Calendar className="h-6 w-6" />
            新しい観察会を作成
          </button>
        ) : (
          <EventForm
            onCancel={() => setShowEventForm(false)}
            onCreate={(input) => {
              const ev = createEvent(user.id, input);
              navigate(`/event-detail/${ev.id}`);
            }}
          />
        )}

        {showCreatures && <CreatureManager db={db} actorId={user.id} />}

        <div ref={formRef} className="scroll-mt-4 space-y-4">
          {editing && (
            <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <span className="flex items-center gap-2">
                <Pencil className="h-4 w-4" />
                記録を編集中：{creatureMap.get(editing.creatureId)?.name}（{editing.date} {editing.time}）
              </span>
              <button type="button" onClick={() => setEditing(null)} className="text-blue-700 underline">
                編集をやめる
              </button>
            </div>
          )}
          <div className="rounded-xl bg-white p-6 shadow-md">
            <RecordForm
              key={editing?.id ?? 'new'}
              actorId={user.id}
              creatures={db.creatures}
              initialRecord={editing ?? undefined}
              title={editing ? '観察記録を編集' : '観察記録を追加'}
              onCancel={editing ? () => setEditing(null) : undefined}
              onSubmit={(input) => {
                if (editing) {
                  updateRecord(user.id, editing.id, input);
                  setEditing(null);
                } else {
                  addRecord(user.id, input);
                }
              }}
            />
          </div>
        </div>

        <section className="rounded-xl bg-white p-6 shadow-md">
          <h2 className="mb-4 text-xl font-bold text-gray-900">最近の記録</h2>
          <div className="mb-3">
            <ErrorText message={listError} />
          </div>
          {recent.length === 0 ? (
            <p className="py-8 text-center text-gray-500">まだ記録がありません</p>
          ) : (
            <div className="space-y-3">
              {recent.map((r) => (
                <RecordCard
                  key={r.id}
                  record={r}
                  creature={creatureMap.get(r.creatureId)}
                  isMine={r.userId === user.id}
                  isEditing={editing?.id === r.id}
                  onEdit={() => startEdit(r)}
                  onDelete={() => remove(r)}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </PageBackground>
  );
}

/** 管理者権限を移譲した本人に、取り消し期限まで表示するバナー */
function RevertTransferBanner({ userId }: { userId: string }) {
  const db = useDb();
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const transfer = db.transfers.find((t) => t.fromUserId === userId && canRevertTransfer(t, now));

  useEffect(() => {
    if (!transfer) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [transfer]);

  if (!transfer) return null;
  const to = db.users.find((u) => u.id === transfer.toUserId);
  const remaining = new Date(transfer.revertDeadline).getTime() - now;

  return (
    <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4">
      <p className="text-sm text-yellow-900">
        管理者権限を <span className="font-bold">{to?.name}</span> さんに移譲しました。あと{' '}
        <span className="font-mono font-bold">{formatRemaining(remaining)}</span> 以内なら取り消せます。
      </p>
      <ErrorText message={error} />
      <button
        type="button"
        onClick={() => {
          try {
            revertTransfer(userId, transfer.id);
          } catch (e) {
            setError(e instanceof StoreError ? e.message : '取り消しに失敗しました');
          }
        }}
        className="mt-2 flex items-center gap-1.5 rounded-lg bg-yellow-600 px-3 py-1.5 text-sm text-white hover:bg-yellow-700"
      >
        <Undo2 className="h-4 w-4" />
        移譲を取り消す
      </button>
    </div>
  );
}
