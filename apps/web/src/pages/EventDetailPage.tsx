import { Calendar, Clock, MapPin, Pencil, Plus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { RecordCard } from '../components/RecordCard';
import { RecordForm } from '../components/RecordForm';
import { BackBar, Card, ErrorText, PageBackground, ShowMoreButton, usePaged } from '../components/ui';
import { compareRecordsDesc, useCreatureMap } from '../lib/selectors';
import { useCurrentUser } from '../lib/auth';
import { addRecord, deleteRecord, StoreError, updateRecord, useDb } from '../lib/store';
import type { ObservationRecord } from '../lib/types';

export function EventDetailPage() {
  const { eventId } = useParams();
  const db = useDb();
  const user = useCurrentUser()!;
  const creatureMap = useCreatureMap(db);
  const event = db.events.find((e) => e.id === eventId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ObservationRecord | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const records = useMemo(
    () => db.records.filter((r) => r.eventId === eventId).sort(compareRecordsDesc),
    [db.records, eventId],
  );
  const page = usePaged(records, 20);

  if (!event) {
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

  const startEdit = (r: ObservationRecord) => {
    setEditing(r);
    setFormOpen(true);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const remove = (r: ObservationRecord) => {
    setListError(null);
    if (!window.confirm('この記録を削除しますか？')) return;
    try {
      deleteRecord(user.id, r.id);
      if (editing?.id === r.id) closeForm();
    } catch (e) {
      setListError(e instanceof StoreError ? e.message : '削除に失敗しました');
    }
  };

  return (
    <PageBackground>
      <BackBar to="/" label="ホームに戻る" />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <Card className="p-6">
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
            この観察会では<span className="font-bold">{records.length}件</span>の観察記録が登録されています
          </p>
        </Card>

        {!formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-3 text-white shadow-md transition-colors hover:bg-green-700"
          >
            <Plus className="h-5 w-5" />
            観察記録を追加
          </button>
        )}

        {formOpen && (
          <div ref={formRef} className="scroll-mt-20 space-y-4">
            {editing && (
              <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                <Pencil className="h-4 w-4" />
                記録を編集中：{creatureMap.get(editing.creatureId)?.name}（{editing.date} {editing.time}）
              </div>
            )}
            <Card className="p-6">
              <RecordForm
                key={editing?.id ?? 'new'}
                actorId={user.id}
                creatures={db.creatures}
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
                onSubmit={(input) => {
                  if (editing) {
                    updateRecord(user.id, editing.id, input);
                    closeForm();
                  } else {
                    addRecord(user.id, input);
                  }
                }}
              />
            </Card>
          </div>
        )}

        <Card className="p-6">
          <h2 className="mb-4 text-xl font-bold text-gray-900">観察記録一覧</h2>
          <div className="mb-3">
            <ErrorText message={listError} />
          </div>
          {records.length === 0 ? (
            <p className="py-8 text-center text-gray-500">まだ観察記録がありません</p>
          ) : (
            <div className="space-y-3">
              {page.visible.map((r) => (
                <RecordCard
                  key={r.id}
                  record={r}
                  creature={creatureMap.get(r.creatureId)}
                  isMine={r.userId === user.id}
                  showTimeOfDay
                  isEditing={editing?.id === r.id}
                  onEdit={() => startEdit(r)}
                  onDelete={() => remove(r)}
                />
              ))}
            </div>
          )}
          {page.hasMore && <ShowMoreButton rest={page.rest} onClick={page.showMore} />}
        </Card>
      </main>
    </PageBackground>
  );
}
