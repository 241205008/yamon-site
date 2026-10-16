import { Calendar, Filter, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Marker, Tooltip, useMapEvents } from 'react-leaflet';
import { pinIcon } from '../components/mapPins';
import { SurveyMap } from '../components/SurveyMap';
import { BackBar, CategoryBadge, Modal, PageBackground, inputClass } from '../components/ui';
import { MAP_CENTER, getTimeOfDay, monthOf } from '@yamon/shared';
import { compareRecordsDesc, hasCoords, useCreatureMap } from '../lib/selectors';
import { useDb } from '../lib/store';
import { TIMES_OF_DAY, type ObservationRecord, type TimeOfDay } from '../lib/types';

interface Group {
  key: string;
  lat: number;
  lng: number;
  records: ObservationRecord[];
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function filterBtn(active: boolean) {
  return `w-full rounded-lg px-4 py-2 text-left text-sm transition-colors ${
    active ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
  }`;
}

function CenterTracker({ onChange }: { onChange: (c: { lat: number; lng: number }) => void }) {
  const map = useMapEvents({ moveend: () => onChange(map.getCenter()) });
  return null;
}

export function MapPage() {
  const db = useDb();
  const creatureMap = useCreatureMap(db);
  const [creatureSearch, setCreatureSearch] = useState('');
  const [creatureId, setCreatureId] = useState<string | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay | null>(null);
  const [center, setCenter] = useState(MAP_CENTER);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const visibleCreatures = useMemo(() => {
    const q = creatureSearch.trim();
    return q ? db.creatures.filter((c) => c.name.includes(q)) : db.creatures;
  }, [db.creatures, creatureSearch]);

  // 場所未指定・座標なしの記録はマップに出さない。各フィルターは AND 条件
  const filtered = useMemo(
    () =>
      db.records.filter(
        (r) =>
          r.locationType !== 'none' &&
          hasCoords(r) &&
          (!creatureId || r.creatureId === creatureId) &&
          (!month || monthOf(r.date) === month) &&
          (!timeOfDay || getTimeOfDay(r.time) === timeOfDay),
      ),
    [db.records, creatureId, month, timeOfDay],
  );

  // 小数点3桁（約100m）で同じ地点をまとめる
  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    filtered.forEach((r) => {
      const lat = r.lat!;
      const lng = r.lng!;
      const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
      const g = m.get(key);
      if (g) g.records.push(r);
      else m.set(key, { key, lat, lng, records: [r] });
    });
    m.forEach((g) => g.records.sort(compareRecordsDesc));
    return [...m.values()];
  }, [filtered]);
  // 別タブでの変更も反映されるよう、開いている地点は key で引き直す
  const openGroup = groups.find((g) => g.key === openKey) ?? null;

  return (
    <PageBackground>
      <BackBar to="/" label="記録画面に戻る" />
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-4">
        <aside className="h-fit rounded-xl bg-white p-6 shadow-md lg:col-span-1">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
            <Filter className="h-5 w-5" />
            生き物フィルター
          </h2>
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={creatureSearch}
              onChange={(e) => setCreatureSearch(e.target.value)}
              placeholder="生き物を検索..."
              className={`${inputClass} py-2 pl-10 text-sm`}
            />
          </div>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            <button type="button" className={filterBtn(creatureId === null)} onClick={() => setCreatureId(null)}>
              全て表示
            </button>
            {visibleCreatures.map((c) => (
              <button
                key={c.id}
                type="button"
                className={filterBtn(creatureId === c.id)}
                onClick={() => setCreatureId(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>

          <hr className="my-6 border-gray-200" />

          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
            <Calendar className="h-5 w-5" />
            日時フィルター
          </h2>
          <p className="mb-2 text-sm text-gray-700">観察月</p>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            <button type="button" className={filterBtn(month === null)} onClick={() => setMonth(null)}>
              全て表示
            </button>
            {MONTHS.map((m) => (
              <button key={m} type="button" className={filterBtn(month === m)} onClick={() => setMonth(m)}>
                {m}月
              </button>
            ))}
          </div>
          <p className="mt-4 mb-2 text-sm text-gray-700">時間帯</p>
          <div className="space-y-2">
            <button type="button" className={filterBtn(timeOfDay === null)} onClick={() => setTimeOfDay(null)}>
              全て表示
            </button>
            {TIMES_OF_DAY.map((t) => (
              <button key={t} type="button" className={filterBtn(timeOfDay === t)} onClick={() => setTimeOfDay(t)}>
                {t}
              </button>
            ))}
          </div>
        </aside>

        <section className="relative h-[600px] overflow-hidden rounded-xl shadow-md lg:col-span-3">
          <SurveyMap center={MAP_CENTER} zoom={14} className="h-full w-full">
            <CenterTracker onChange={setCenter} />
            {groups.map((g) => (
              <Marker
                key={g.key}
                position={[g.lat, g.lng]}
                icon={pinIcon(g.records.length)}
                eventHandlers={{ click: () => setOpenKey(g.key) }}
              >
                <Tooltip direction="top">
                  <div className="text-xs">
                    <p className="font-bold">{g.records[0].locationName}</p>
                    {g.records.slice(0, 3).map((r) => (
                      <p key={r.id}>
                        {creatureMap.get(r.creatureId)?.name}・{r.date} {r.time}
                      </p>
                    ))}
                    {g.records.length > 3 && <p>ほか{g.records.length - 3}件</p>}
                  </div>
                </Tooltip>
              </Marker>
            ))}
          </SurveyMap>

          <div className="pointer-events-none absolute top-4 left-4 z-[1000] rounded-lg bg-white px-4 py-2 shadow-md">
            <p className="text-sm text-gray-700">マップビュー</p>
            <p className="text-xs text-gray-500">
              中心座標: {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
            </p>
          </div>

          <div className="pointer-events-none absolute right-4 bottom-8 z-[1000] rounded-lg bg-white p-3 shadow-md">
            <p className="mb-2 text-sm text-gray-700">凡例</p>
            <p className="flex items-center gap-2 text-sm text-gray-700">
              <span className="inline-block h-3.5 w-3 rounded-t-full rounded-b-sm bg-red-500" />
              観察地点
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm text-gray-700">
              <span className="relative inline-block h-3.5 w-3 rounded-t-full rounded-b-sm bg-red-400">
                <span className="absolute -top-1.5 -right-2 flex h-3 w-3 items-center justify-center rounded-full bg-blue-600 text-[8px] font-bold text-white">
                  N
                </span>
              </span>
              複数の記録
            </p>
            <p className="mt-2 text-xs text-gray-500">{filtered.length}件の記録</p>
          </div>

          {filtered.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-[999] flex items-center justify-center">
              <p className="rounded-lg bg-white/90 px-4 py-2 text-sm text-gray-600 shadow">
                条件に合う記録がありません
              </p>
            </div>
          )}
        </section>
      </main>

      <Modal open={!!openGroup} onClose={() => setOpenKey(null)} title="観察記録の詳細">
        {openGroup && (
          <div className="space-y-3">
            {openGroup.records.map((r) => {
              const c = creatureMap.get(r.creatureId);
              return (
                <div key={r.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900">{c?.name}</span>
                    {c && <CategoryBadge category={c.category} />}
                  </div>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    <dt className="text-gray-500">場所</dt>
                    <dd className="text-gray-800">{r.locationName}</dd>
                    <dt className="text-gray-500">日時</dt>
                    <dd className="text-gray-800">
                      {r.date} {r.time}（{getTimeOfDay(r.time)}）
                    </dd>
                    <dt className="text-gray-500">座標</dt>
                    <dd className="text-gray-800">
                      {r.lat!.toFixed(4)}, {r.lng!.toFixed(4)}
                    </dd>
                  </dl>
                  {r.memo && (
                    <p className="mt-2 rounded border border-yellow-200 bg-yellow-50 px-2 py-1.5 text-sm text-gray-700">
                      💬 {r.memo}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </PageBackground>
  );
}
