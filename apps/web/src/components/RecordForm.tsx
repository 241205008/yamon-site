import { Clock, Plus, Search } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import {
  CATEGORIES,
  nowTimeJst,
  todayJst,
  type Category,
  type CreatureView,
  type LocationType,
  type MainLocationView,
  type RecordInput,
  type RecordView,
} from '@yamon/shared';
import { errorMessage, useCreateCreature } from '../lib/queries';
import { CoordinatePicker } from './CoordinatePicker';
import { ErrorText, inputClass } from './ui';

interface Props {
  creatures: CreatureView[];
  /** 主な場所（「使わない」場所も含めて渡す。選択肢には使う場所と、編集中の記録の場所だけを出す） */
  mainLocations: MainLocationView[];
  /** 生き物をその場で登録できるか（creatures.manage） */
  canAddCreature: boolean;
  /** 観察会に紐付ける場合の ID */
  eventId?: string | null;
  /** 編集時の初期値 */
  initialRecord?: RecordView;
  /** 新規追加時の初期値（観察会の場所・日付など） */
  defaults?: {
    mainLocationId?: string | null;
    otherLocationName?: string;
    lat?: number | null;
    lng?: number | null;
    date?: string;
  };
  /** 失敗したら例外を投げる（入力内容は消さずにエラーを出す） */
  onSubmit: (input: RecordInput) => Promise<void>;
  onCancel?: () => void;
  title?: string;
}

const radioClass = 'h-4 w-4 accent-blue-600';

export function RecordForm({
  creatures,
  mainLocations,
  canAddCreature,
  eventId = null,
  initialRecord,
  defaults,
  onSubmit,
  onCancel,
  title = '観察記録を追加',
}: Props) {
  const isEdit = !!initialRecord;
  const today = todayJst();
  const findMainLocation = (id: string | null | undefined) => mainLocations.find((l) => l.id === id);

  const [search, setSearch] = useState('');
  const [creatureId, setCreatureId] = useState(initialRecord?.creatureId ?? '');

  const createCreature = useCreateCreature();
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<Category>(CATEGORIES[0]);
  const [newMemo, setNewMemo] = useState('');
  const [newError, setNewError] = useState<string | null>(null);

  const initialLocationType: LocationType =
    initialRecord?.locationType ?? (defaults?.mainLocationId ? 'main' : 'other');
  const [locationType, setLocationType] = useState<LocationType>(initialLocationType);
  const [mainLocationId, setMainLocationId] = useState(
    initialRecord?.mainLocationId ?? defaults?.mainLocationId ?? '',
  );
  const [otherName, setOtherName] = useState(
    initialRecord
      ? initialRecord.locationType === 'other'
        ? initialRecord.locationName
        : ''
      : (defaults?.otherLocationName ?? ''),
  );
  // 主な場所で「主な場所そのものの座標」なら詳細座標は未指定として扱う
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(() => {
    const src = initialRecord ?? {
      lat: defaults?.lat ?? null,
      lng: defaults?.lng ?? null,
      mainLocationId: defaults?.mainLocationId ?? null,
    };
    if (src.lat === null || src.lng === null) return null;
    const loc = findMainLocation(src.mainLocationId);
    if (loc && loc.lat === src.lat && loc.lng === src.lng) return null;
    return { lat: src.lat, lng: src.lng };
  });

  // 未来日の観察会でも記録できるよう、初期値は今日を超えないようにする
  const initialDate =
    initialRecord?.date ?? (defaults?.date && defaults.date <= today ? defaults.date : today);
  // 編集時は日付を固定する（「今日」モードだと日付をまたいで保存したときに日付が変わってしまう）
  const [dateMode, setDateMode] = useState<'today' | 'custom'>(
    !isEdit && initialDate === today ? 'today' : 'custom',
  );
  const [customDate, setCustomDate] = useState(initialDate);
  const [time, setTime] = useState(initialRecord?.time ?? '');
  const [memo, setMemo] = useState(initialRecord?.memo ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim();
    return q ? creatures.filter((c) => c.name.includes(q)) : creatures;
  }, [creatures, search]);
  const selected = creatures.find((c) => c.id === creatureId);
  const selectedMain = findMainLocation(mainLocationId);
  // 「使わない」場所は選択肢に出さない。編集中の記録の場所だけは残す
  const mainOptions = mainLocations.filter((l) => l.isActive || l.id === initialRecord?.mainLocationId);

  const registerCreature = async () => {
    setNewError(null);
    try {
      const c = await createCreature.mutateAsync({ name: newName, category: newCategory, memo: newMemo });
      setCreatureId(c.id);
      setSearch('');
      setNewOpen(false);
      setNewName('');
      setNewMemo('');
    } catch (e) {
      setNewError(errorMessage(e, '登録に失敗しました'));
    }
  };

  const changeLocationType = (t: LocationType) => {
    setLocationType(t);
    setCoords(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    // サーバーでも確かめる。よくある入力漏れだけ、送る前に分かりやすく伝える
    if (!creatureId) return setError('生き物を選択してください');
    if (locationType === 'main' && !mainLocationId) return setError('主な場所を選択してください');
    if (!time) return setError('時刻を入力してください');
    setSubmitting(true);
    try {
      await onSubmit({
        creatureId,
        eventId,
        locationType,
        mainLocationId: locationType === 'main' ? mainLocationId : null,
        otherLocationName: otherName,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        date: dateMode === 'today' ? todayJst() : customDate,
        time,
        memo,
      });
      if (!isEdit) {
        setCreatureId('');
        setSearch('');
        setCoords(null);
        setTime('');
        setMemo('');
      }
    } catch (err) {
      // 入力内容は消さない
      setError(errorMessage(err, '保存に失敗しました'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">{title}</h2>

      {/* 生き物 */}
      <div>
        <label className="mb-2 block text-sm text-gray-700" htmlFor="creature-select">
          生き物の種類
        </label>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="生き物を検索..."
            className={`${inputClass} pl-10`}
          />
        </div>
        <select
          id="creature-select"
          size={5}
          value={creatureId}
          onChange={(e) => setCreatureId(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">選択してください</option>
          {filtered.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.category})
            </option>
          ))}
          {/* 検索で絞り込まれても、選択中の生き物は消さない */}
          {selected && !filtered.includes(selected) && (
            <option value={selected.id}>
              {selected.name} ({selected.category})
            </option>
          )}
        </select>
        {selected?.memo && (
          <p className="mt-2 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-gray-700">
            💬 {selected.memo}
          </p>
        )}

        {!canAddCreature ? null : !newOpen ? (
          <button
            type="button"
            onClick={() => {
              setNewOpen(true);
              setNewName(search.trim());
            }}
            className="mt-2 text-sm text-green-600 hover:text-green-700"
          >
            + 新しい生き物を登録
          </button>
        ) : (
          <div className="mt-3 space-y-3 rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-800">新しい生き物を登録</p>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="名前（例: カナヘビ）"
              className={`${inputClass} bg-white`}
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as Category)}
              className={`${inputClass} bg-white`}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <textarea
              value={newMemo}
              onChange={(e) => setNewMemo(e.target.value)}
              placeholder="生き物のメモ（任意）"
              rows={2}
              className={`${inputClass} bg-white`}
            />
            <ErrorText message={newError} />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void registerCreature()}
                disabled={createCreature.isPending}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-60"
              >
                {createCreature.isPending ? '登録中…' : '登録する'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewOpen(false);
                  setNewError(null);
                }}
                className="rounded-lg bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 場所 */}
      <fieldset>
        <legend className="mb-2 text-sm text-gray-700">場所の種類</legend>
        <div className="space-y-2">
          {(
            [
              ['main', '主な場所'],
              ['none', '場所を指定しない'],
              ['other', 'その他の場所'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="locationType"
                checked={locationType === value}
                onChange={() => changeLocationType(value)}
                className={radioClass}
              />
              {label}
            </label>
          ))}
        </div>

        {locationType === 'main' && (
          <div className="mt-3 space-y-3 border-l-2 border-blue-500 pl-4">
            <label className="block text-sm text-gray-700" htmlFor="main-location">
              主な場所
            </label>
            <select
              id="main-location"
              value={mainLocationId}
              onChange={(e) => {
                setMainLocationId(e.target.value);
                setCoords(null);
              }}
              className={inputClass}
            >
              <option value="">選択してください</option>
              {mainOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {!l.isActive && '（使っていない場所）'}
                </option>
              ))}
            </select>
            {selectedMain && (
              <>
                <p className="text-xs text-gray-500">
                  詳細な位置を指定しない場合は、{selectedMain.name}の座標で記録します。
                </p>
                <CoordinatePicker value={coords} onChange={setCoords} mapInitial={selectedMain} />
              </>
            )}
          </div>
        )}

        {locationType === 'other' && (
          <div className="mt-3 space-y-3 border-l-2 border-blue-500 pl-4">
            <label className="block text-sm text-gray-700" htmlFor="other-location">
              場所の名前（任意）
            </label>
            <input
              id="other-location"
              value={otherName}
              onChange={(e) => setOtherName(e.target.value)}
              placeholder="例: 新しい池"
              className={inputClass}
            />
            <CoordinatePicker value={coords} onChange={setCoords} mapInitial={null} />
          </div>
        )}
      </fieldset>

      {/* 日時 */}
      <fieldset>
        <legend className="mb-2 text-sm text-gray-700">日時を選択</legend>
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              name="dateMode"
              checked={dateMode === 'today'}
              onChange={() => setDateMode('today')}
              className={radioClass}
            />
            今日
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              name="dateMode"
              checked={dateMode === 'custom'}
              onChange={() => setDateMode('custom')}
              className={radioClass}
            />
            日付を指定
          </label>
        </div>
        {dateMode === 'custom' && (
          <input
            type="date"
            value={customDate}
            max={today}
            onChange={(e) => setCustomDate(e.target.value)}
            className={`${inputClass} mt-3`}
            aria-label="観察日"
          />
        )}
      </fieldset>

      <div>
        <label className="mb-2 block text-sm text-gray-700" htmlFor="record-time">
          時刻
        </label>
        <div className="flex gap-2">
          <input
            id="record-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => setTime(nowTimeJst())}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-gray-100 px-4 text-gray-700 hover:bg-gray-200"
          >
            <Clock className="h-4 w-4" />
            現在時刻
          </button>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm text-gray-700" htmlFor="record-memo">
          観察についてのメモ（任意）
        </label>
        <textarea
          id="record-memo"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="観察時の状況や特徴などを記録..."
          rows={3}
          className={inputClass}
        />
      </div>

      <ErrorText message={error} />

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 py-3 text-white transition-colors hover:bg-green-700 disabled:opacity-60"
        >
          <Plus className="h-5 w-5" />
          {submitting ? '保存中…' : isEdit ? '記録を更新' : '記録を追加'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-gray-100 px-5 text-gray-700 hover:bg-gray-200"
          >
            キャンセル
          </button>
        )}
      </div>
    </form>
  );
}
