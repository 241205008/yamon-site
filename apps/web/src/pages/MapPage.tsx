import { Calendar, Filter, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Marker, Tooltip, useMapEvents } from 'react-leaflet';
import { pinIcon } from '../components/mapPins';
import { SurveyMap } from '../components/SurveyMap';
import { BackBar, CategoryBadge, ErrorText, Modal, PageBackground, inputClass } from '../components/ui';
import { MAP_CENTER, TIMES_OF_DAY, getTimeOfDay, type RecordView, type TimeOfDay } from '@yamon/shared';
import { errorMessage, useCreatures, useMapRecords } from '../lib/queries';

interface Group {
  key: string;
  lat: number;
  lng: number;
  records: RecordView[];
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
  const creaturesQuery = useCreatures();
  const [creatureSearch, setCreatureSearch] = useState('');
  const [creatureId, setCreatureId] = useState<string | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay | null>(null);
  const [center, setCenter] = useState(MAP_CENTER);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const visibleCreatures = useMemo(() => {
    const all = creaturesQuery.data ?? [];
    const q = creatureSearch.trim();
    return q ? all.filter((c) => c.name.includes(q)) : all;
  }, [creaturesQuery.data, creatureSearch]);

  // 場所未指定・座標なしの記録は API が返さない。各フィルターは AND 条件で、API で絞り込む（新しい順）
  const recordsQuery = useMapRecords({ creatureId, month, timeOfDay });
  const filtered = useMemo(() => recordsQuery.data ?? [], [recordsQuery.data]);

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
    return [...m.values()];
  }, [filtered]);
  // 別タブでの変更も反映されるよう、開いている地点は key で引き直す
  const openGroup = groups.find((g) => g.key === openKey) ?? null;

  return (
    <PageBackground>
      <BackBar to="/" label="記録画面に戻る" />
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-4">
        {/* lg より狭い画面では地図を先に出し、フィルターは地図の下に並べる（#39、D48）。パソコンは左にフィルター・右に地図 */}
        <aside className="order-2 h-fit rounded-xl bg-white p-6 shadow-md lg:order-1 lg:col-span-1">
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
          <ErrorText message={creaturesQuery.isError ? errorMessage(creaturesQuery.error, '生き物を読み込めませんでした') : null} />
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

        <section className="relative order-1 h-[60vh] min-h-[360px] overflow-hidden rounded-xl shadow-md lg:order-2 lg:col-span-3 lg:h-[600px]">
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
                        {r.creatureName}・{r.date} {r.time}
                        {r.approximate && '（おおよその位置）'}
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

          {recordsQuery.isError ? (
            <div className="absolute inset-x-4 top-20 z-[1000]">
              <ErrorText message={`記録を読み込めませんでした。${errorMessage(recordsQuery.error)}`} />
              <button
                type="button"
                onClick={() => void recordsQuery.refetch()}
                className="mt-2 rounded-lg bg-white px-4 py-2 text-sm text-gray-700 shadow hover:bg-gray-50"
              >
                もう一度読み込む
              </button>
            </div>
          ) : (
            (recordsQuery.isPending || filtered.length === 0) && (
              <div className="pointer-events-none absolute inset-0 z-[999] flex items-center justify-center">
                <p role="status" className="rounded-lg bg-white/90 px-4 py-2 text-sm text-gray-600 shadow">
                  {recordsQuery.isPending ? '記録を読み込み中…' : '条件に合う記録がありません'}
                </p>
              </div>
            )
          )}
        </section>
      </main>

      <Modal open={!!openGroup} onClose={() => setOpenKey(null)} title="観察記録の詳細">
        {openGroup && (
          <div className="space-y-3">
            {openGroup.records.map((r) => {
              return (
                <div key={r.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900">{r.creatureName}</span>
                    <CategoryBadge category={r.category} />
                  </div>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    <dt className="text-gray-500">場所</dt>
                    <dd className="text-gray-800">{r.locationName}</dd>
                    <dt className="text-gray-500">日時</dt>
                    <dd className="text-gray-800">
                      {r.date} {r.time}（{getTimeOfDay(r.time)}）
                    </dd>
                    <dt className="text-gray-500">記録者</dt>
                    <dd className="text-gray-800">{r.recorderName}</dd>
                    <dt className="text-gray-500">座標</dt>
                    <dd className="text-gray-800">
                      {r.approximate ? (
                        <>
                          {r.lat!.toFixed(3)}, {r.lng!.toFixed(3)}
                          <span className="ml-1 text-xs text-red-700">（おおよその位置・約1km単位）</span>
                        </>
                      ) : (
                        <>
                          {r.lat!.toFixed(4)}, {r.lng!.toFixed(4)}
                        </>
                      )}
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
