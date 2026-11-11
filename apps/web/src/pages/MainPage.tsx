import { Calendar, Pencil } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { CreatureManager } from '../components/CreatureManager';
import { HomeHeader } from '../components/HomeHeader';
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
      <HomeHeader
        user={user}
        showCreatures={showCreatures}
        onToggleCreatures={() => setShowCreatures((v) => !v)}
        onLogout={() => {
          void logout().then(() => navigate('/login'));
        }}
      />

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">

        {!canCreateEvent ? null : !showEventForm ? (
          <button
            type="button"
            onClick={() => setShowEventForm(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-4 text-lg font-bold text-white shadow-md transition-colors hover:bg-green-700"
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
