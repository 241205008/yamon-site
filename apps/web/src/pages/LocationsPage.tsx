import { MapPin } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BackBar, CategoryBadge, PageBackground, QueryState } from '../components/ui';
import { useLocationStats, useMainLocations } from '../lib/queries';

const TAG_LIMIT = 5;

export function LocationsPage() {
  const locationsQuery = useMainLocations();
  const statsQuery = useLocationStats();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 主な場所ごとの「生き物と観察回数（多い順）」。集計は API（その他の場所・場所未指定は対象外）
  const creaturesByLocation = useMemo(
    () => new Map((statsQuery.data?.locations ?? []).map((l) => [l.mainLocationId, l.creatures])),
    [statsQuery.data],
  );
  // 「使わない」場所も、記録があれば一覧に残す（D27）
  const locations = (locationsQuery.data ?? []).filter((l) => l.isActive || creaturesByLocation.has(l.id));

  const selected = locations.find((l) => l.id === selectedId);
  const selectedCreatures = selected ? (creaturesByLocation.get(selected.id) ?? []) : [];

  return (
    <PageBackground>
      <BackBar to="/" label="記録画面に戻る" />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-6 text-3xl font-bold text-gray-900">場所別の生き物一覧</h1>
        <QueryState query={locationsQuery.isError ? locationsQuery : statsQuery} label="場所別の記録">
        {locations.length === 0 && (
          <p className="rounded-xl bg-white p-6 text-center text-gray-500 shadow-md">
            主な場所がまだ登録されていません。管理者画面から登録できます。
          </p>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            {locations.map((loc) => {
              const list = creaturesByLocation.get(loc.id) ?? [];
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
                      {!loc.isActive && <span className="text-sm font-normal text-gray-500">（使っていない場所）</span>}
                    </h2>
                    <span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">
                      {list.length}種類
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    座標: {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                  </p>
                  {list.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {list.slice(0, TAG_LIMIT).map((c) => (
                        <span key={c.id} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                          {c.name}
                        </span>
                      ))}
                      {list.length > TAG_LIMIT && (
                        <span className="px-1 py-1 text-xs text-gray-500">+{list.length - TAG_LIMIT}</span>
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
                  <p className="mt-1 text-sm text-gray-500">{selectedCreatures.length}種類の生き物が記録されています</p>
                  {selectedCreatures.length === 0 ? (
                    <p className="py-8 text-center text-gray-500">この場所の記録はまだありません</p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {selectedCreatures.map((c) => (
                        <div key={c.id} className="rounded-lg border border-gray-200 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-bold text-gray-900">{c.name}</span>
                              <CategoryBadge category={c.category} />
                            </div>
                            <span className="text-sm text-gray-600">観察回数: {c.count}回</span>
                          </div>
                          {c.memo && <p className="mt-2 text-sm text-gray-600">{c.memo}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        </QueryState>
      </main>
    </PageBackground>
  );
}
