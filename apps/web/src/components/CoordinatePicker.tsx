import { MapPin, Navigation, X } from 'lucide-react';
import { useState } from 'react';
import { getCurrentPosition } from '../lib/geo';
import { MapPickerModal } from './MapPickerModal';

/** 「マップで位置を選択」「現在位置を取得」ボタンと、選んだ座標の表示 */
export function CoordinatePicker({
  value,
  onChange,
  mapInitial,
}: {
  value: { lat: number; lng: number } | null;
  onChange: (v: { lat: number; lng: number } | null) => void;
  mapInitial: { lat: number; lng: number } | null;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const useGps = async () => {
    setGeoError(null);
    setLocating(true);
    try {
      onChange(await getCurrentPosition());
    } catch (e) {
      setGeoError((e as Error).message);
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-white transition-colors hover:bg-blue-700"
      >
        <MapPin className="h-4 w-4" />
        マップで位置を選択
      </button>
      <button
        type="button"
        onClick={useGps}
        disabled={locating}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 py-2.5 text-white transition-colors hover:bg-purple-700 disabled:opacity-60"
      >
        <Navigation className="h-4 w-4" />
        {locating ? '取得中…' : '現在位置を取得'}
      </button>
      {value && (
        <div className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <span>
            緯度 {value.lat.toFixed(4)} / 経度 {value.lng.toFixed(4)}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded p-0.5 text-blue-500 hover:bg-blue-100"
            aria-label="座標をクリア"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {geoError && <p className="text-sm text-red-600">{geoError}</p>}
      {pickerOpen && (
        <MapPickerModal
          open
          onClose={() => setPickerOpen(false)}
          onSelect={(lat, lng) => onChange({ lat, lng })}
          initial={value ?? mapInitial}
        />
      )}
    </div>
  );
}
