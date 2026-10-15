import { MapPin } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BackBar, CategoryBadge, PageBackground } from '../components/ui';
import { MAIN_LOCATIONS } from '@yamon/shared';
import { useCreatureMap } from '../lib/selectors';
import { useDb } from '../lib/store';

const TAG_LIMIT = 5;

export function LocationsPage() {
  const db = useDb();
  const creatureMap = useCreatureMap(db);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 主な場所ごとに「生き物ID → 観察回数」を集計（その他の場所・場所未指定は対象外）
  const countsByLocation = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    db.records.forEach((r) => {
      if (r.locationType !== 'main' || !r.mainLocationId) return;
      const counts = m.get(r.mainLocationId) ?? new Map<string, number>();
      counts.set(r.creatureId, (counts.get(r.creatureId) ?? 0) + 1);
      m.set(r.mainLocationId, counts);
    });
    return m;
  }, [db.records]);

  const selected = MAIN_LOCATIONS.find((l) => l.id === selectedId);
  const selectedCounts = selected
    ? [...(countsByLocation.get(selected.id) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])
    : [];

  return (
    <PageBackground>
      <BackBar to="/" label="記録画面に戻る" />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-6 text-3xl font-bold text-gray-900">場所別の生き物一覧</h1>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            {MAIN_LOCATIONS.map((loc) => {
              const counts = countsByLocation.get(loc.id);
              const ids = counts ? [...counts.keys()] : [];
              const active = loc.id === selectedId;
              return (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => setSelectedId(loc.id)}
                  aria-pressed={active}
                  className={`block w-full rounded-xl bg-white p-6 text-left shadow-md transition-all hover:shadow-lg ${
                    active ? 'ring-2 ring-green-500' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
                      <MapPin className="h-5 w-5 text-green-600" />
                      {loc.name}
                    </h2>
                    <span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">
                      {ids.length}種類
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    座標: {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                  </p>
                  {ids.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ids.slice(0, TAG_LIMIT).map((id) => (
                        <span key={id} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                          {creatureMap.get(id)?.name}
                        </span>
                      ))}
                      {ids.length > TAG_LIMIT && (
                        <span className="px-1 py-1 text-xs text-gray-500">+{ids.length - TAG_LIMIT}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-xl bg-white p-6 shadow-md">
              {!selected ? (
                <div className="py-12 text-center text-gray-400">
                  <MapPin className="mx-auto mb-4 h-12 w-12" />
                  <p>場所を選択すると、そこで見られる生き物の一覧が表示されます</p>
                </div>
              ) : (
                <>
                  <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
                    <MapPin className="h-6 w-6 text-green-600" />
                    {selected.name}
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">{selectedCounts.length}種類の生き物が記録されています</p>
                  {selectedCounts.length === 0 ? (
                    <p className="py-8 text-center text-gray-500">この場所の記録はまだありません</p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {selectedCounts.map(([id, count]) => {
                        const c = creatureMap.get(id);
                        return (
                          <div key={id} className="rounded-lg border border-gray-200 p-4">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-lg font-bold text-gray-900">{c?.name}</span>
                                {c && <CategoryBadge category={c.category} />}
                              </div>
                              <span className="text-sm text-gray-600">観察回数: {count}回</span>
                            </div>
                            {c?.memo && <p className="mt-2 text-sm text-gray-600">{c.memo}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </PageBackground>
  );
}
