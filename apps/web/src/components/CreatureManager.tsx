import { FileText, List, Pencil, Search, Tag, Trash2 } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, searchMatcher, type Category, type CreaturePatch, type CreatureView } from '@yamon/shared';
import { errorMessage, useCreatures, useDeleteCreature, useUpdateCreature } from '../lib/queries';
import { CategoryBadge, ErrorText, inputClass, Modal, QueryState, ShowMoreButton, usePaged } from './ui';

/**
 * 生き物管理パネル（一覧・検索・編集・削除）。canManage がなければ一覧だけ出す。
 * canProtect（管理者・幹部）なら、編集で「位置を保護する」印を付け外しできる（D24）
 */
export function CreatureManager({ canManage, canProtect }: { canManage: boolean; canProtect: boolean }) {
  const creaturesQuery = useCreatures();
  const creatures = useMemo(() => creaturesQuery.data ?? [], [creaturesQuery.data]);
  const deleteCreature = useDeleteCreature();
  const [search, setSearch] = useState('');
  // 鉛筆ボタンで選ぶ → 「名前・カテゴリ」か「メモ」の編集に進む（#97）
  const [editing, setEditing] = useState<{ creature: CreatureView; mode: EditMode } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const match = searchMatcher(search);
    return match ? creatures.filter((c) => match(c.name) || match(c.memo)) : creatures;
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
                  {c.locationProtected && (
                    <span className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700">🔒 位置を保護</span>
                  )}
                  <span className="text-xs text-gray-500">記録 {c.recordCount}件</span>
                </div>
                {/* メモの改行をそのまま出す（#97） */}
                {c.memo && <p className="mt-1 text-sm whitespace-pre-wrap text-gray-600">{c.memo}</p>}
              </div>
              {canManage && (
              <>
              <button
                type="button"
                onClick={() => setEditing({ creature: c, mode: 'choose' })}
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

      {editing?.mode === 'choose' && (
        <EditChoiceModal
          creature={editing.creature}
          onChoose={(mode) => setEditing({ creature: editing.creature, mode })}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.mode === 'basic' && (
        <BasicEditModal creature={editing.creature} canProtect={canProtect} onClose={() => setEditing(null)} />
      )}
      {editing?.mode === 'memo' && <MemoEditModal creature={editing.creature} onClose={() => setEditing(null)} />}
    </section>
  );
}

type EditMode = 'choose' | 'basic' | 'memo';

const choiceBtn =
  'flex w-full items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 text-left text-gray-900 transition-colors hover:border-green-300 hover:bg-green-50';

/** 鉛筆ボタンで開く、編集する内容の選択（#97） */
function EditChoiceModal({
  creature,
  onChoose,
  onClose,
}: {
  creature: CreatureView;
  onChoose: (mode: 'basic' | 'memo') => void;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title={`「${creature.name}」の何を編集しますか？`}>
      <div className="space-y-2">
        <button type="button" onClick={() => onChoose('basic')} className={choiceBtn}>
          <Tag className="h-5 w-5 shrink-0 text-green-600" />
          <span>
            <span className="block font-medium">名前・カテゴリを編集</span>
            <span className="block text-sm text-gray-500">名前、カテゴリ（部門）、位置を保護するかどうか</span>
          </span>
        </button>
        <button type="button" onClick={() => onChoose('memo')} className={choiceBtn}>
          <FileText className="h-5 w-5 shrink-0 text-green-600" />
          <span>
            <span className="block font-medium">メモを編集</span>
            <span className="block text-sm text-gray-500">メモの全体を見ながら書き直す</span>
          </span>
        </button>
      </div>
    </Modal>
  );
}

/** 保存と取り消しのボタン（2つの編集画面で共通） */
function SaveButtons({ saving, onSave, onClose }: { saving: boolean; onSave: () => void; onClose: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200">
        キャンセル
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 disabled:opacity-60"
      >
        {saving ? '保存中…' : '保存'}
      </button>
    </div>
  );
}

/** 名前・カテゴリ（と、管理者・幹部なら「位置を保護する」印）の編集。メモは今のまま送る */
function BasicEditModal({
  creature,
  canProtect,
  onClose,
}: {
  creature: CreatureView;
  canProtect: boolean;
  onClose: () => void;
}) {
  const updateCreature = useUpdateCreature();
  const [locationProtected, setLocationProtected] = useState(creature.locationProtected);
  const [name, setName] = useState(creature.name);
  const [category, setCategory] = useState<Category>(creature.category);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    try {
      // 変えた項目だけを送る（#99）。メモや、変えていない項目は送らないので、
      // ほかの人が同時に変えた値を、この画面を開いたときの古い値で上書きしない。
      // 印は権限がある人だけが送る（API も、権限のない人の印の変更は 403 にする）
      const input: CreaturePatch = {};
      if (name.trim() !== creature.name) input.name = name;
      if (category !== creature.category) input.category = category;
      if (canProtect && locationProtected !== creature.locationProtected) input.locationProtected = locationProtected;
      if (Object.keys(input).length > 0) await updateCreature.mutateAsync({ id: creature.id, input });
      onClose();
    } catch (e) {
      // 入力内容は消さない
      setError(errorMessage(e, '保存に失敗しました'));
    }
  };

  return (
    <Modal open onClose={onClose} title="名前・カテゴリを編集">
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
        {canProtect && (
          <label className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            <input
              type="checkbox"
              checked={locationProtected}
              onChange={(e) => setLocationProtected(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-red-600"
            />
            <span>
              位置を保護する（各県のレッドデータブックで絶滅危惧種の生き物）
              <span className="block text-xs text-red-700">
                部員と OB・OG には、記録の場所（場所名・座標）を表示せず、マップにも出しません。記録した本人と管理者・幹部には正確な位置を表示します。
              </span>
            </span>
          </label>
        )}
        <ErrorText message={error} />
        <SaveButtons saving={updateCreature.isPending} onSave={() => void save()} onClose={onClose} />
      </div>
    </Modal>
  );
}

/**
 * メモの編集（#97）。入力欄の高さを中身に合わせて広げ、メモの全体を1画面で見ながら書けるようにする。
 * メモだけを送るので、名前・カテゴリ・印は今のまま（#99）
 */
function MemoEditModal({ creature, onClose }: { creature: CreatureView; onClose: () => void }) {
  const updateCreature = useUpdateCreature();
  const [memo, setMemo] = useState(creature.memo);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 入力欄の高さを中身に合わせる（入力欄の中をスクロールしなくても全体が見える）。
  // 幅が変わる（スマホの向きを変える）と折り返しが変わるので、そのときも合わせ直す
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [memo]);

  const save = async () => {
    setError(null);
    try {
      // メモだけを送る（#99）。名前・カテゴリは送らないので、ほかの人が同時に変えても上書きしない
      if (memo.trim() !== creature.memo) await updateCreature.mutateAsync({ id: creature.id, input: { memo } });
      onClose();
    } catch (e) {
      setError(errorMessage(e, '保存に失敗しました'));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`「${creature.name}」のメモを編集`}
      wide
      // メモが長くても保存のボタンが見えるよう、ダイアログの下に固定する
      footer={<SaveButtons saving={updateCreature.isPending} onSave={() => void save()} onClose={onClose} />}
    >
      <div className="space-y-4">
        <label className="sr-only" htmlFor="cr-memo">メモ</label>
        <textarea
          id="cr-memo"
          ref={textareaRef}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={6}
          className={`${inputClass} resize-none overflow-hidden leading-relaxed`}
          placeholder="この生き物についてのメモ"
        />
        <p className="text-right text-xs text-gray-500">{memo.length}文字</p>
        <ErrorText message={error} />
      </div>
    </Modal>
  );
}
