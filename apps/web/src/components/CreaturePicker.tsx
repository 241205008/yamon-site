import { searchMatcher, type CreatureView } from '@yamon/shared';
import { Check, Search } from 'lucide-react';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { inputClass } from './ui';

interface Props {
  creatures: CreatureView[];
  /** 選ばれている生き物の ID（未選択は ''） */
  value: string;
  onChange: (id: string) => void;
  /** 検索欄の文字。親が、記録の追加の後などに空に戻せるよう、親が持つ */
  search: string;
  onSearchChange: (search: string) => void;
  /** 一致する生き物がないときに、「新しい生き物を登録」を案内するか */
  canAddCreature: boolean;
}

/**
 * 生き物を検索して選ぶ欄（#95、D55）。入力に合わせて、欄のすぐ下に候補をその場で出す（コンボボックス）。
 * ネイティブの <select> は、スマホでは閉じたドロップダウンになって候補が見えず、選び直せない不具合（#93）もあったのでやめた。
 * 検索はひらがなでもカタカナに当たる（#91、searchMatcher）。
 */
export function CreaturePicker({ creatures, value, onChange, search, onSearchChange, canAddCreature }: Props) {
  const id = useId();
  const inputId = `${id}-input`;
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const match = useMemo(() => searchMatcher(search), [search]);
  const candidates = useMemo(() => (match ? creatures.filter((c) => match(c.name)) : creatures), [creatures, match]);
  const selected = creatures.find((c) => c.id === value);
  const activeIndex = Math.min(active, Math.max(candidates.length - 1, 0));

  const choose = (c: CreatureView) => {
    onChange(c.id);
    onSearchChange('');
    setOpen(false);
  };

  const moveActive = (next: number) => {
    setActive(next);
    // 動かした候補が見えるようにする
    listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView?.({ block: 'nearest' });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // 日本語の変換中（かなの確定の Enter や、変換候補を選ぶ ↓↑）は、候補の操作にしない
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return setOpen(true);
      if (candidates.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      moveActive((activeIndex + step + candidates.length) % candidates.length);
    } else if (e.key === 'Enter') {
      // 候補が開いている間の Enter は、記録の送信ではなく候補を選ぶ
      if (open && candidates[activeIndex]) {
        e.preventDefault();
        choose(candidates[activeIndex]);
      }
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  // 生き物が1件もなくても、入力があれば「登録されていません」と登録の案内を出す
  const showList = open && (creatures.length > 0 || match !== null);

  return (
    <div>
      <label className="mb-2 block text-sm text-gray-700" htmlFor={inputId}>
        生き物の種類
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          id={inputId}
          type="search"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && candidates[activeIndex] ? `${id}-opt-${activeIndex}` : undefined}
          aria-describedby={selected ? `${id}-selected` : undefined}
          value={search}
          onChange={(e) => {
            onSearchChange(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          // 一覧の中を押したときは onMouseDown で blur を止めるので、ここで閉じても候補の選択には間に合う
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder={selected ? '別の生き物を検索...' : '生き物を検索...'}
          className={`${inputClass} pl-10`}
        />
        {showList && (
          <div
            // 一覧のどこを押しても（スクロールバー・件数の行を含む）、検索欄の blur で一覧が閉じないようにする
            onMouseDown={(e) => e.preventDefault()}
            className="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
          >
            <p className="border-b border-gray-100 px-3 py-1.5 text-xs text-gray-500" aria-live="polite">
              {match ? `${candidates.length}件見つかりました` : `登録されている生き物（${creatures.length}件）`}
            </p>
            <ul id={listId} ref={listRef} role="listbox" aria-label="生き物の候補" className="max-h-64 overflow-y-auto py-1">
              {candidates.map((c, i) => (
                <li
                  key={c.id}
                  id={`${id}-opt-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={c.id === value}
                  onClick={() => choose(c)}
                  onMouseMove={() => i !== activeIndex && setActive(i)}
                  className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-gray-900 ${i === activeIndex ? 'bg-green-50' : ''}`}
                >
                  <span>
                    {c.name} <span className="text-sm text-gray-500">({c.category})</span>
                  </span>
                  {c.id === value && <Check className="h-4 w-4 shrink-0 text-green-600" aria-hidden />}
                </li>
              ))}
            </ul>
            {candidates.length === 0 && (
              <p className="px-3 py-3 text-sm text-gray-600">
                「{search.trim()}」は登録されていません。
                {canAddCreature && '下の「新しい生き物を登録」から登録できます。'}
              </p>
            )}
          </div>
        )}
      </div>
      {selected ? (
        <p id={`${id}-selected`} className="mt-2 flex items-center gap-1.5 text-sm text-gray-700">
          <Check className="h-4 w-4 text-green-600" aria-hidden />
          選択中：<span className="font-medium text-gray-900">{selected.name}</span>（{selected.category}）
        </p>
      ) : (
        <p className="mt-2 text-sm text-gray-500">名前を入れると、下に候補が出ます。押して選んでください。</p>
      )}
    </div>
  );
}
