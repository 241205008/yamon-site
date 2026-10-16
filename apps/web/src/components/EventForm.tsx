import { Calendar, MapPin, Navigation } from 'lucide-react';
import { useState } from 'react';
import { getCurrentPosition } from '../lib/geo';
import { todayJst, type EventInput, type EventView, type MainLocationView } from '@yamon/shared';
import { errorMessage } from '../lib/queries';
import { ErrorText, inputClass } from './ui';

const STEPS = ['観察会名', '場所', '日時'];

/** 観察会の3ステップウィザード。initial を渡すと編集（#7）になり、今の値が入った状態で始まる */
export function EventForm({
  mainLocations,
  initial,
  onCreate,
  onCancel,
}: {
  mainLocations: MainLocationView[];
  /** 編集するときの今の観察会 */
  initial?: EventView;
  /** 失敗したら例外を投げる（入力内容は消さずにエラーを出す） */
  onCreate: (input: EventInput) => Promise<void>;
  onCancel: () => void;
}) {
  const isEdit = !!initial;
  const initialMain = mainLocations.find((l) => l.id === initial?.mainLocationId);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initial?.name ?? '');
  const [mainLocationId, setMainLocationId] = useState<string | null>(initial?.mainLocationId ?? null);
  const [otherName, setOtherName] = useState(initial && !initial.mainLocationId ? initial.locationName : '');
  // 主な場所そのものの座標なら、現在位置は使っていないものとして扱う
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(() => {
    if (!initial || initial.lat === null || initial.lng === null) return null;
    if (initialMain && initialMain.lat === initial.lat && initialMain.lng === initial.lng) return null;
    return { lat: initial.lat, lng: initial.lng };
  });
  const [locating, setLocating] = useState(false);
  const [date, setDate] = useState(initial?.date ?? todayJst());
  const [time, setTime] = useState(initial?.time ?? '');
  // 「使わない」場所は選択肢に出さない。編集中の観察会の場所だけは残す
  const locationOptions = mainLocations.filter((l) => l.isActive || l.id === initial?.mainLocationId);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const locationLabel = mainLocations.find((l) => l.id === mainLocationId)?.name ?? otherName.trim();
  const canNext = step === 0 ? !!name.trim() : step === 1 ? !!locationLabel : !!date && !!time;

  const toggleGps = async () => {
    setError(null);
    if (coords) {
      setCoords(null);
      return;
    }
    setLocating(true);
    try {
      setCoords(await getCurrentPosition());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLocating(false);
    }
  };

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({
        name,
        mainLocationId,
        otherLocationName: otherName,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        date,
        time,
      });
    } catch (e) {
      setError(errorMessage(e, isEdit ? '保存に失敗しました' : '作成に失敗しました'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border-2 border-orange-200 bg-white p-6 shadow-md">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <Calendar className="h-5 w-5 text-orange-600" />
          {isEdit ? '観察会を編集' : '新しい観察会を作成'}
        </h2>
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-800">
          {isEdit ? 'キャンセル' : '閉じる'}
        </button>
      </div>

      <ol className="mb-6 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                i <= step ? 'bg-orange-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              {i + 1}
            </span>
            <span className={`text-sm ${i === step ? 'font-bold text-gray-900' : 'text-gray-500'}`}>
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-gray-200" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div>
          <label className="mb-2 block text-sm text-gray-700" htmlFor="event-name">
            観察会名 <span className="text-red-500">*</span>
          </label>
          <input
            id="event-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 夏の森林公園観察会"
            className={inputClass}
            autoFocus
          />
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-700">主な場所</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {locationOptions.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  setMainLocationId(l.id);
                  setOtherName('');
                }}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  mainLocationId === l.id
                    ? 'border-orange-500 bg-orange-50 text-orange-800'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <MapPin className="h-4 w-4 shrink-0" />
                {l.name}
              </button>
            ))}
          </div>
          <div>
            <label className="mb-2 block text-sm text-gray-700" htmlFor="event-other">
              その他の場所
            </label>
            <input
              id="event-other"
              value={otherName}
              onChange={(e) => {
                setOtherName(e.target.value);
                if (e.target.value) setMainLocationId(null);
              }}
              placeholder="例: 市民の森"
              className={inputClass}
            />
          </div>
          <button
            type="button"
            onClick={toggleGps}
            disabled={locating}
            aria-pressed={!!coords}
            className={`flex w-full items-center justify-center gap-2 rounded-lg py-2.5 transition-colors ${
              coords ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
            }`}
          >
            <Navigation className="h-4 w-4" />
            {locating
              ? '取得中…'
              : coords
                ? `現在位置を使用中（${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}）`
                : '現在位置を使用'}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm text-gray-700" htmlFor="event-date">
                日付 <span className="text-red-500">*</span>
              </label>
              <input id="event-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-2 block text-sm text-gray-700" htmlFor="event-time">
                時間 <span className="text-red-500">*</span>
              </label>
              <input id="event-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
            </div>
          </div>
          {date && time && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm">
              <dt className="text-gray-500">観察会名</dt>
              <dd className="text-gray-900">{name}</dd>
              <dt className="text-gray-500">場所</dt>
              <dd className="text-gray-900">
                {locationLabel}
                {coords && '（現在位置）'}
              </dd>
              <dt className="text-gray-500">日時</dt>
              <dd className="text-gray-900">
                {date} {time}〜
              </dd>
            </dl>
          )}
        </div>
      )}

      <div className="mt-4">
        <ErrorText message={error} />
      </div>

      <div className="mt-6 flex gap-2">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="rounded-lg bg-gray-100 px-5 py-2.5 text-gray-700 hover:bg-gray-200"
          >
            戻る
          </button>
        )}
        <button
          type="button"
          disabled={!canNext || submitting}
          onClick={() => (step < 2 ? setStep(step + 1) : void submit())}
          className="flex-1 rounded-lg bg-orange-600 py-2.5 text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {step < 2 ? '次へ' : submitting ? '保存中…' : isEdit ? '変更を保存' : '観察会を作成'}
        </button>
      </div>
    </div>
  );
}
