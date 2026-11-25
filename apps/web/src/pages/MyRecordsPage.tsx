import { CalendarRange, Pencil } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { can, type RecordView } from '@yamon/shared';
import { CreaturePicker } from '../components/CreaturePicker';
import { RecordCard } from '../components/RecordCard';
import { RecordForm } from '../components/RecordForm';
import {
  BackBar,
  Card,
  ErrorText,
  firstUnready,
  inputClass,
  PageBackground,
  QueryState,
  ShowMoreButton,
} from '../components/ui';
import { useCurrentUser } from '../lib/auth';
import {
  errorMessage,
  useCreatures,
  useDeleteRecord,
  useMainLocations,
  useRecordPages,
  useUpdateRecord,
} from '../lib/queries';

const PAGE_SIZE = 20;

/**
 * 自分の観察記録の一覧（#120、D64）。新しい順にすべて出し、「さらに表示」で古い記録までさかのぼれる。
 * 絞り込み（生き物・期間）は API で行うので、まだ読み込んでいない古い記録も漏れなく当たる。
 * OB・OG は見るだけ（編集・削除のボタンを出さない。API でも断る、MVP 2章）
 */
export function MyRecordsPage() {
  const user = useCurrentUser()!;
  const canEditOwn = can(user.role, 'records.editOwn');

  const [creatureId, setCreatureId] = useState('');
  const [creatureSearch, setCreatureSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const rangeInvalid = !!from && !!to && from > to;

  const creatures = useCreatures();
  const mainLocations = useMainLocations();
  // 期間が逆のときは、前の結果を出したまま読み込まない（API は 400 を返す）
  const recordsQuery = useRecordPages({
    mine: true,
    creatureId: creatureId || null,
    from: rangeInvalid ? '' : from,
    to: rangeInvalid ? '' : to,
    limit: PAGE_SIZE,
  });
  const records = recordsQuery.data?.pages.flatMap((p) => p.records) ?? [];
  const total = recordsQuery.data?.pages[0]?.total ?? 0;
  const filtered = !!creatureId || !!from || !!to;

  const updateRecord = useUpdateRecord();
  const deleteRecord = useDeleteRecord();
  const [editing, setEditing] = useState<RecordView | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const startEdit = (r: RecordView) => {
    setEditing(r);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
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

  const clearFilter = () => {
    setCreatureId('');
    setCreatureSearch('');
    setFrom('');
    setTo('');
  };

  return (
    <PageBackground>
      <BackBar to="/" label="ホーム画面に戻る" title="自分の記録" />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        {!canEditOwn && (
          <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
            OB・OG のアカウントでは、記録を見ることだけができます（直す・消すことはできません）。
          </p>
        )}

        {editing && canEditOwn && (
          <div ref={formRef} className="scroll-mt-20 space-y-4">
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <Pencil className="h-4 w-4" />
              記録を編集中：{editing.creatureName}（{editing.date} {editing.time}）
            </div>
            <Card className="p-6">
              <QueryState query={firstUnready(creatures, mainLocations)} label="入力の選択肢">
                <RecordForm
                  key={editing.id}
                  creatures={creatures.data ?? []}
                  mainLocations={mainLocations.data ?? []}
                  canAddCreature={can(user.role, 'creatures.manage')}
                  canProtect={can(user.role, 'creatures.protect')}
                  eventId={editing.eventId}
                  initialRecord={editing}
                  title="観察記録を編集"
                  onCancel={() => setEditing(null)}
                  onSubmit={async (input) => {
                    await updateRecord.mutateAsync({ id: editing.id, input });
                    setEditing(null);
                  }}
                />
              </QueryState>
            </Card>
          </div>
        )}

        <Card className="p-6">
          <h2 className="mb-4 text-xl font-bold text-gray-900">絞り込み</h2>
          <div className="space-y-4">
            <QueryState query={creatures} label="生き物">
              <CreaturePicker
                creatures={creatures.data ?? []}
                value={creatureId}
                onChange={setCreatureId}
                search={creatureSearch}
                onSearchChange={setCreatureSearch}
                canAddCreature={false}
              />
            </QueryState>
            <fieldset>
              <legend className="mb-2 flex items-center gap-1.5 text-sm text-gray-700">
                <CalendarRange className="h-4 w-4" />
                観察した日の期間
              </legend>
              {/* スマホ幅でも崩れないよう、2つの欄を縦に並べ、それぞれに見出しを付ける */}
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs text-gray-600">
                  いつから
                  <input
                    type="date"
                    aria-label="いつから"
                    value={from}
                    max={to || undefined}
                    onChange={(e) => setFrom(e.target.value)}
                    className={`${inputClass} mt-1`}
                  />
                </label>
                <label className="block text-xs text-gray-600">
                  いつまで
                  <input
                    type="date"
                    aria-label="いつまで"
                    value={to}
                    min={from || undefined}
                    onChange={(e) => setTo(e.target.value)}
                    className={`${inputClass} mt-1`}
                  />
                </label>
              </div>
            </fieldset>
            <ErrorText message={rangeInvalid ? '期間の「いつから」は「いつまで」より前の日付にしてください' : null} />
            {filtered && (
              <button type="button" onClick={clearFilter} className="text-sm text-blue-700 underline">
                絞り込みを解除する
              </button>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-xl font-bold text-gray-900">
            自分の観察記録
            {recordsQuery.isSuccess && <span className="ml-2 text-base font-normal text-gray-600">{total}件</span>}
          </h2>
          <div className="mb-3">
            <ErrorText message={listError} />
          </div>
          <QueryState query={recordsQuery} label="観察記録">
            {records.length === 0 ? (
              <p className="py-8 text-center text-gray-500">
                {filtered ? '条件に合う記録はありません' : 'まだ記録がありません'}
              </p>
            ) : (
              <div className="space-y-3">
                {records.map((r) => (
                  <div key={r.id}>
                    <RecordCard
                      record={r}
                      isMine
                      canEdit={canEditOwn}
                      showTimeOfDay
                      isEditing={editing?.id === r.id}
                      onEdit={() => startEdit(r)}
                      onDelete={() => void remove(r)}
                    />
                    {r.eventId && (
                      <Link to={`/event-detail/${r.eventId}`} className="mt-1 ml-1 inline-block text-xs text-green-700 underline">
                        この記録の観察会を開く
                      </Link>
                    )}
                  </div>
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
            <ErrorText
              message={recordsQuery.isFetchNextPageError ? errorMessage(recordsQuery.error, '続きを読み込めませんでした') : null}
            />
          </QueryState>
        </Card>
      </main>
    </PageBackground>
  );
}
