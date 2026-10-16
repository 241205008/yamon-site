import { Calendar, Clock, MapPin, Pencil, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useParams } from 'react-router';
import { can, type RecordView } from '@yamon/shared';
import { RecordCard } from '../components/RecordCard';
import { RecordForm } from '../components/RecordForm';
import { BackBar, Card, ErrorText, PageBackground, QueryState, ShowMoreButton } from '../components/ui';
import { ApiError } from '../lib/api';
import { useCurrentUser } from '../lib/auth';
import {
  errorMessage,
  useCreateRecord,
  useCreatures,
  useDeleteRecord,
  useEvent,
  useMainLocations,
  useRecordPages,
  useUpdateRecord,
} from '../lib/queries';

const PAGE_SIZE = 20;

export function EventDetailPage() {
  const { eventId = '' } = useParams();
  const user = useCurrentUser()!;
  const canCreateRecord = can(user.role, 'records.create');
  const canEditOwn = can(user.role, 'records.editOwn');

  const eventQuery = useEvent(eventId);
  const event = eventQuery.data;
  const recordsQuery = useRecordPages({ eventId, limit: PAGE_SIZE });
  const records = recordsQuery.data?.pages.flatMap((p) => p.records) ?? [];
  const total = recordsQuery.data?.pages[0]?.total ?? 0;
  const creatures = useCreatures();
  const mainLocations = useMainLocations();
  const createRecord = useCreateRecord();
  const updateRecord = useUpdateRecord();
  const deleteRecord = useDeleteRecord();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecordView | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  if (eventQuery.error instanceof ApiError && eventQuery.error.status === 404) {
    return (
      <PageBackground>
        <BackBar to="/" label="ホームに戻る" />
        <main className="mx-auto max-w-4xl px-4 py-16 text-center text-gray-600">
          観察会が見つかりませんでした。削除されたか、URLが間違っている可能性があります。
        </main>
      </PageBackground>
    );
  }

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const startEdit = (r: RecordView) => {
    setEditing(r);
    setFormOpen(true);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const remove = async (r: RecordView) => {
    setListError(null);
    if (!window.confirm('この記録を削除しますか？')) return;
    try {
      await deleteRecord.mutateAsync(r.id);
      if (editing?.id === r.id) closeForm();
    } catch (e) {
      setListError(errorMessage(e, '削除に失敗しました'));
    }
  };

  return (
    <PageBackground>
      <BackBar to="/" label="ホームに戻る" />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <Card className="p-6">
          <QueryState query={eventQuery} label="観察会">
            {event && (
              <>
                <h1 className="text-3xl font-bold text-gray-900">{event.name}</h1>
                <div className="mt-4 grid gap-2 text-gray-700 sm:grid-cols-3">
                  <span className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-green-600" />
                    {event.locationName}
                  </span>
                  <span className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-blue-600" />
                    {event.date}
                  </span>
                  <span className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-purple-600" />
                    {event.time}〜
                  </span>
                </div>
                <p className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-800">
                  この観察会では<span className="font-bold">{event.recordCount}件</span>の観察記録が登録されています
                </p>
              </>
            )}
          </QueryState>
        </Card>

        {event && canCreateRecord && !formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-3 text-white shadow-md transition-colors hover:bg-green-700"
          >
            <Plus className="h-5 w-5" />
            観察記録を追加
          </button>
        )}

        {event && canCreateRecord && formOpen && (
          <div ref={formRef} className="scroll-mt-20 space-y-4">
            {editing && (
              <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                <Pencil className="h-4 w-4" />
                記録を編集中：{editing.creatureName}（{editing.date} {editing.time}）
              </div>
            )}
            <Card className="p-6">
              <QueryState query={creatures.isError ? creatures : mainLocations} label="入力の選択肢">
                <RecordForm
                  key={editing?.id ?? 'new'}
                  creatures={creatures.data ?? []}
                  mainLocations={mainLocations.data ?? []}
                  canAddCreature={can(user.role, 'creatures.manage')}
                  eventId={event.id}
                  initialRecord={editing ?? undefined}
                  defaults={{
                    mainLocationId: event.mainLocationId,
                    otherLocationName: event.mainLocationId ? '' : event.locationName,
                    lat: event.lat,
                    lng: event.lng,
                    date: event.date,
                  }}
                  title={editing ? '観察記録を編集' : '観察記録を追加'}
                  onCancel={closeForm}
                  onSubmit={async (input) => {
                    if (editing) {
                      await updateRecord.mutateAsync({ id: editing.id, input });
                      closeForm();
                    } else {
                      await createRecord.mutateAsync(input);
                    }
                  }}
                />
              </QueryState>
            </Card>
          </div>
        )}

        <Card className="p-6">
          <h2 className="mb-4 text-xl font-bold text-gray-900">観察記録一覧</h2>
          <div className="mb-3">
            <ErrorText message={listError} />
          </div>
          <QueryState query={recordsQuery} label="観察記録">
            {records.length === 0 ? (
              <p className="py-8 text-center text-gray-500">まだ観察記録がありません</p>
            ) : (
              <div className="space-y-3">
                {records.map((r) => (
                  <RecordCard
                    key={r.id}
                    record={r}
                    isMine={r.userId === user.id}
                    canEdit={r.userId === user.id && canEditOwn}
                    showTimeOfDay
                    isEditing={editing?.id === r.id}
                    onEdit={() => startEdit(r)}
                    onDelete={() => void remove(r)}
                  />
                ))}
              </div>
            )}
            {recordsQuery.hasNextPage && (
              <ShowMoreButton
                rest={Math.max(0, total - records.length)}
                loading={recordsQuery.isFetchingNextPage}
                onClick={() => void recordsQuery.fetchNextPage()}
              />
            )}
            <ErrorText message={recordsQuery.isFetchNextPageError ? errorMessage(recordsQuery.error, '続きを読み込めませんでした') : null} />
          </QueryState>
        </Card>
      </main>
    </PageBackground>
  );
}
