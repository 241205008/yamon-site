import { List, Pencil, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATEGORIES, type Category, type CreatureView } from '@yamon/shared';
import { errorMessage, useCreatures, useDeleteCreature, useUpdateCreature } from '../lib/queries';
import { CategoryBadge, ErrorText, inputClass, Modal, QueryState, ShowMoreButton, usePaged } from './ui';

/** 生き物管理パネル（一覧・検索・編集・削除）。canManage がなければ一覧だけ出す */
export function CreatureManager({ canManage }: { canManage: boolean }) {
  const creaturesQuery = useCreatures();
  const creatures = useMemo(() => creaturesQuery.data ?? [], [creaturesQuery.data]);
  const deleteCreature = useDeleteCreature();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<CreatureView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim();
    return q ? creatures.filter((c) => c.name.includes(q) || c.memo.includes(q)) : creatures;
  }, [creatures, search]);
  const page = usePaged(filtered, 30);

  const remove = async (c: CreatureView) => {
    setError(null);
    if (!window.confirm(`「${c.name}」を削除しますか？`)) return;
    try {
      await deleteCreature.mutateAsync(c.id);
    } catch (e) {
      setError(errorMessage(e, '削除に失敗しました'));
    }
  };

  return (
    <section className="rounded-xl border-2 border-purple-200 bg-white p-6 shadow-md">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900">
        <List className="h-5 w-5 text-purple-600" />
        生き物管理
        <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-sm font-normal text-purple-700">
          {creatures.length}種類
        </span>
      </h2>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="生き物を検索..."
          className={`${inputClass} pl-10`}
        />
      </div>
      <div className="mb-3">
        <ErrorText message={error} />
      </div>
      <QueryState query={creaturesQuery} label="生き物">
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">該当する生き物がいません</p>
      ) : (
        <ul className="space-y-2">
          {page.visible.map((c) => (
            <li key={c.id} className="flex items-start gap-3 rounded-lg border border-gray-200 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-gray-900">{c.name}</span>
                  <CategoryBadge category={c.category} />
                  <span className="text-xs text-gray-500">記録 {c.recordCount}件</span>
                </div>
                {c.memo && <p className="mt-1 text-sm text-gray-600">{c.memo}</p>}
              </div>
              {canManage && (
              <>
              <button
                type="button"
                onClick={() => setEditing(c)}
                className="rounded p-1.5 text-blue-600 hover:bg-blue-50"
                aria-label={`${c.name}を編集`}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void remove(c)}
                disabled={deleteCreature.isPending}
                className="rounded p-1.5 text-red-600 hover:bg-red-50"
                aria-label={`${c.name}を削除`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
              </>
              )}
            </li>
          ))}
        </ul>
      )}
      {page.hasMore && <ShowMoreButton rest={page.rest} onClick={page.showMore} />}
      </QueryState>

      {editing && (
        <CreatureEditModal creature={editing} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}

function CreatureEditModal({ creature, onClose }: { creature: CreatureView; onClose: () => void }) {
  const updateCreature = useUpdateCreature();
  const [name, setName] = useState(creature.name);
  const [category, setCategory] = useState<Category>(creature.category);
  const [memo, setMemo] = useState(creature.memo);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    try {
      await updateCreature.mutateAsync({ id: creature.id, input: { name, category, memo } });
      onClose();
    } catch (e) {
      // 入力内容は消さない
      setError(errorMessage(e, '保存に失敗しました'));
    }
  };

  return (
    <Modal open onClose={onClose} title="生き物を編集">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-gray-700" htmlFor="cr-name">名前</label>
          <input id="cr-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          {name.trim() !== creature.name && (
            <p className="mt-1 text-xs text-gray-500">名前を変えると、この生き物の既存の記録すべてに反映されます。</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-700" htmlFor="cr-category">カテゴリ</label>
          <select
            id="cr-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className={inputClass}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-700" htmlFor="cr-memo">メモ</label>
          <textarea id="cr-memo" value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} className={inputClass} />
        </div>
        <ErrorText message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200">
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={updateCreature.isPending}
            className="rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 disabled:opacity-60"
          >
            {updateCreature.isPending ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
