import { Calendar, ChevronRight, Clock, MapPin } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { BackBar, Card, PageBackground, ShowMoreButton, StatCard, usePaged } from '../components/ui';
import { useCreatureMap } from '../lib/selectors';
import { useDb } from '../lib/store';
import type { ObservationRecord } from '../lib/types';

const TAG_LIMIT = 6;

export function EventListPage() {
  const db = useDb();
  const creatureMap = useCreatureMap(db);

  const recordsByEvent = useMemo(() => {
    const m = new Map<string, ObservationRecord[]>();
    db.records.forEach((r) => {
      if (r.eventId) m.set(r.eventId, [...(m.get(r.eventId) ?? []), r]);
    });
    return m;
  }, [db.records]);

  const events = useMemo(
    () =>
      [...db.events].sort(
        (a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time) || b.createdAt.localeCompare(a.createdAt),
      ),
    [db.events],
  );
  const page = usePaged(events, 20);

  const eventRecords = db.records.filter((r) => r.eventId);
  const speciesCount = new Set(eventRecords.map((r) => r.creatureId)).size;

  return (
    <PageBackground>
      <BackBar to="/" label="ホームに戻る" />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900">観察会一覧</h1>
        <p className="mt-2 text-gray-600">過去に実施された観察会と観察記録を確認できます</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatCard label="総観察会数" value={db.events.length} color="green" />
          <StatCard label="総観察記録数" value={eventRecords.length} color="blue" />
          <StatCard label="観察された生き物の種類" value={speciesCount} color="purple" />
        </div>

        <Card className="mt-8 p-6">
          <h2 className="mb-4 text-xl font-bold text-gray-900">開催された観察会</h2>
          {events.length === 0 ? (
            <p className="py-8 text-center text-gray-500">まだ観察会がありません。ホームから作成できます。</p>
          ) : (
            <div className="space-y-4">
              {page.visible.map((ev) => {
                const records = recordsByEvent.get(ev.id) ?? [];
                const creatureIds = [...new Set(records.map((r) => r.creatureId))];
                const hidden = creatureIds.length - TAG_LIMIT;
                return (
                  <Link
                    key={ev.id}
                    to={`/event-detail/${ev.id}`}
                    className="block rounded-lg border border-gray-200 p-4 transition-colors hover:border-green-300 hover:bg-green-50/30"
                  >
                    <div className="flex items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-bold text-gray-900">{ev.name}</h3>
                        <div className="mt-3 grid gap-2 text-sm text-gray-700 sm:grid-cols-3">
                          <span className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-green-600" />
                            {ev.locationName}
                          </span>
                          <span className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-blue-600" />
                            {ev.date}
                          </span>
                          <span className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-purple-600" />
                            {ev.time}〜
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-sm">
                          <span className="rounded-full bg-green-50 px-3 py-1 text-green-800">
                            観察記録: {records.length}件
                          </span>
                          <span className="rounded-full bg-purple-50 px-3 py-1 text-purple-700">
                            生き物: {creatureIds.length}種類
                          </span>
                        </div>
                        {creatureIds.length > 0 && (
                          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                            <p className="mb-2 text-xs text-blue-700">観察された生き物</p>
                            <div className="flex flex-wrap gap-2">
                              {creatureIds.slice(0, TAG_LIMIT).map((id) => {
                                const c = creatureMap.get(id);
                                return (
                                  <span
                                    key={id}
                                    className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-purple-700"
                                  >
                                    {c?.name} ({c?.category})
                                  </span>
                                );
                              })}
                              {hidden > 0 && (
                                <span className="rounded px-2 py-1 text-xs text-gray-600">+{hidden}種</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-gray-400" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          {page.hasMore && <ShowMoreButton rest={page.rest} onClick={page.showMore} />}
        </Card>
      </main>
    </PageBackground>
  );
}
