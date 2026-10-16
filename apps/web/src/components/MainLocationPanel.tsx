import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { MAP_CENTER, isInSurveyArea, type MainLocationView } from '@yamon/shared';
import {
  errorMessage,
  useCreateMainLocation,
  useDeleteMainLocation,
  useMainLocations,
  useUpdateMainLocation,
} from '../lib/queries';
import { CoordinatePicker } from './CoordinatePicker';
import { Card, ErrorText, inputClass, Modal, QueryState } from './ui';

/**
 * 管理者画面の「主な場所」：追加・名前と座標の編集・「使わない」の切り替え・削除（D27）。
 * 記録や観察会がある場所は削除できないので、使わなくなったら「使わない」にする
 */
export function MainLocationPanel() {
  const query = useMainLocations();
  const update = useUpdateMainLocation();
  const remove = useDeleteMainLocation();
  const [editing, setEditing] = useState<MainLocationView | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleActive = async (l: MainLocationView) => {
    setError(null);
    try {
      await update.mutateAsync({ id: l.id, input: { name: l.name, lat: l.lat, lng: l.lng, isActive: !l.isActive } });
    } catch (e) {
      setError(errorMessage(e, '切り替えに失敗しました'));
    }
  };

  const del = async (l: MainLocationView) => {
    setError(null);
    if (!window.confirm(`「${l.name}」を削除しますか？`)) return;
    try {
      await remove.mutateAsync(l.id);
    } catch (e) {
      setError(errorMessage(e, '削除に失敗しました'));
    }
  };

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <MapPin className="h-5 w-5 text-green-600" />
          主な場所
        </h2>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700"
        >
          <Plus className="h-4 w-4" />
          場所を追加
        </button>
      </div>
      <p className="mb-3 text-sm text-gray-600">
        記録・観察会の場所の選択肢になります。記録がある場所は削除できないので、使わなくなったら「使わない」にしてください（過去の記録と場所別一覧には残ります）。
      </p>
      <div className="mb-3">
        <ErrorText message={error} />
      </div>
      <QueryState query={query} label="主な場所">
        {(query.data ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">まだ主な場所がありません。「場所を追加」から登録してください。</p>
        ) : (
          <ul className="space-y-2">
            {(query.data ?? []).map((l) => (
              <li
                key={l.id}
                className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${
                  l.isActive ? 'border-gray-200' : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-bold ${l.isActive ? 'text-gray-900' : 'text-gray-500'}`}>{l.name}</span>
                    {!l.isActive && (
                      <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600">使わない</span>
                    )}
                    <span className="text-xs text-gray-500">
                      記録 {l.recordCount}件・観察会 {l.eventCount}件
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    座標: {l.lat.toFixed(4)}, {l.lng.toFixed(4)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleActive(l)}
                  disabled={update.isPending}
                  className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 disabled:opacity-60"
                >
                  {l.isActive ? '使わないにする' : '使うに戻す'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(l)}
                  className="rounded p-1.5 text-blue-600 hover:bg-blue-50"
                  aria-label={`${l.name}を編集`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                {l.recordCount === 0 && l.eventCount === 0 && (
                  <button
                    type="button"
                    onClick={() => void del(l)}
                    disabled={remove.isPending}
                    className="rounded p-1.5 text-red-600 hover:bg-red-50"
                    aria-label={`${l.name}を削除`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryState>

      {editing && (
        <MainLocationModal location={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </Card>
  );
}

/** 追加・編集のモーダル。座標は地図・現在位置・数値の入力のどれでも決められる */
function MainLocationModal({ location, onClose }: { location: MainLocationView | null; onClose: () => void }) {
  const create = useCreateMainLocation();
  const update = useUpdateMainLocation();
  const [name, setName] = useState(location?.name ?? '');
  const [lat, setLat] = useState(location ? String(location.lat) : '');
  const [lng, setLng] = useState(location ? String(location.lng) : '');
  const [error, setError] = useState<string | null>(null);
  const saving = create.isPending || update.isPending;

  const coords = lat !== '' && lng !== '' && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
    ? { lat: Number(lat), lng: Number(lng) }
    : null;

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError('場所の名前を入力してください');
    if (!coords) return setError('座標を指定してください（地図で選ぶか、緯度・経度を入力）');
    if (!isInSurveyArea(coords.lat, coords.lng)) {
      return setError('観察の範囲（愛知・岐阜・三重・滋賀）の外の座標です');
    }
    const input = { name, lat: coords.lat, lng: coords.lng, isActive: location?.isActive ?? true };
    try {
      if (location) await update.mutateAsync({ id: location.id, input });
      else await create.mutateAsync(input);
      onClose();
    } catch (e) {
      // 入力内容は消さない
      setError(errorMessage(e, '保存に失敗しました'));
    }
  };

  return (
    <Modal open onClose={onClose} title={location ? '主な場所を編集' : '主な場所を追加'}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-gray-700" htmlFor="ml-name">
            名前
          </label>
          <input id="ml-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          {location && name.trim() !== location.name && (
            <p className="mt-1 text-xs text-gray-500">名前を変えると、この場所の過去の記録・観察会の表示にも反映されます。</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm text-gray-700" htmlFor="ml-lat">
              緯度
            </label>
            <input id="ml-lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-700" htmlFor="ml-lng">
              経度
            </label>
            <input id="ml-lng" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} className={inputClass} />
          </div>
        </div>
        <CoordinatePicker
          value={coords}
          onChange={(v) => {
            setLat(v ? v.lat.toFixed(6) : '');
            setLng(v ? v.lng.toFixed(6) : '');
          }}
          mapInitial={coords ?? MAP_CENTER}
        />
        <ErrorText message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200">
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-60"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
