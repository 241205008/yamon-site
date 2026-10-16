import { Calendar, Database as DbIcon, List, LogOut, Map as MapIcon, MapPin, Pencil, Shield } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CreatureManager } from '../components/CreatureManager';
import { EventForm } from '../components/EventForm';
import { RecordCard } from '../components/RecordCard';
import { RecordForm } from '../components/RecordForm';
import { ErrorText, PageBackground, QueryState, firstUnready } from '../components/ui';
import { can, type RecordView } from '@yamon/shared';
import { logout, useCurrentUser } from '../lib/auth';
import {
  errorMessage,
  useCreateEvent,
  useCreateRecord,
  useCreatures,
  useDeleteRecord,
  useMainLocations,
  useRecordPages,
  useUpdateRecord,
} from '../lib/queries';

const RECENT_LIMIT = 10;

const navBtn = 'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-white transition-colors';

export function MainPage() {
  const user = useCurrentUser()!;
  const navigate = useNavigate();
  // OB・OG（閲覧のみ）には追加・編集の操作を出さない（API でも拒否する、MVP 2章）
  const canCreateRecord = can(user.role, 'records.create');
  const canEditOwn = can(user.role, 'records.editOwn');
  const canCreateEvent = can(user.role, 'events.create');

  const creatures = useCreatures();
  const mainLocations = useMainLocations();
  const recentQuery = useRecordPages({ limit: RECENT_LIMIT });
  const recent = recentQuery.data?.pages[0]?.records ?? [];
  const createRecord = useCreateRecord();
  const updateRecord = useUpdateRecord();
  const deleteRecord = useDeleteRecord();
  const createEvent = useCreateEvent();

  const [showEventForm, setShowEventForm] = useState(false);
  const [showCreatures, setShowCreatures] = useState(false);
  const [editing, setEditing] = useState<RecordView | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const startEdit = (r: RecordView) => {
    setEditing(r);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const remove = async (r: RecordView) => {
    setListError(null);
    if (!window.confirm('この記録を削除しますか？')) return;
    try {
      await deleteRecord.mutateAsync(r.id);
      if (editing?.id === r.id) setEditing(null);
    } catch (e) {
      setListError(errorMessage(e, '削除に失敗しました'));
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
            {can(user.role, 'users.manage') && (
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
                void logout().then(() => navigate('/login'));
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

        {!canCreateEvent ? null : !showEventForm ? (
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
            mainLocations={mainLocations.data ?? []}
            onCancel={() => setShowEventForm(false)}
            onCreate={async (input) => {
              const ev = await createEvent.mutateAsync(input);
              navigate(`/event-detail/${ev.id}`);
            }}
          />
        )}

        {showCreatures && <CreatureManager canManage={can(user.role, 'creatures.manage')} canProtect={can(user.role, 'creatures.protect')} />}

        {canCreateRecord && (
        <div ref={formRef} className="scroll-mt-4 space-y-4">
          {editing && (
            <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <span className="flex items-center gap-2">
                <Pencil className="h-4 w-4" />
                記録を編集中：{editing.creatureName}（{editing.date} {editing.time}）
              </span>
              <button type="button" onClick={() => setEditing(null)} className="text-blue-700 underline">
                編集をやめる
              </button>
            </div>
          )}
          <div className="rounded-xl bg-white p-6 shadow-md">
            <QueryState query={firstUnready(creatures, mainLocations)} label="入力の選択肢">
              <RecordForm
                key={editing?.id ?? 'new'}
                creatures={creatures.data ?? []}
                mainLocations={mainLocations.data ?? []}
                canAddCreature={can(user.role, 'creatures.manage')}
                canProtect={can(user.role, 'creatures.protect')}
                initialRecord={editing ?? undefined}
                title={editing ? '観察記録を編集' : '観察記録を追加'}
                onCancel={editing ? () => setEditing(null) : undefined}
                onSubmit={async (input) => {
                  if (editing) {
                    await updateRecord.mutateAsync({ id: editing.id, input });
                    setEditing(null);
                  } else {
                    await createRecord.mutateAsync(input);
                  }
                }}
              />
            </QueryState>
          </div>
        </div>
        )}

        <section className="rounded-xl bg-white p-6 shadow-md">
          <h2 className="mb-4 text-xl font-bold text-gray-900">最近の記録</h2>
          <div className="mb-3">
            <ErrorText message={listError} />
          </div>
          <QueryState query={recentQuery} label="記録">
          {recent.length === 0 ? (
            <p className="py-8 text-center text-gray-500">まだ記録がありません</p>
          ) : (
            <div className="space-y-3">
              {recent.map((r) => (
                <RecordCard
                  key={r.id}
                  record={r}
                  isMine={r.userId === user.id}
                  canEdit={r.userId === user.id && canEditOwn}
                  isEditing={editing?.id === r.id}
                  onEdit={() => startEdit(r)}
                  onDelete={() => void remove(r)}
                />
              ))}
            </div>
          )}
          </QueryState>
        </section>
      </main>
    </PageBackground>
  );
}
