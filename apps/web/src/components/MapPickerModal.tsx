import { useState } from 'react';
import { Marker, useMapEvents } from 'react-leaflet';
import { MAP_CENTER, isInSurveyArea } from '@yamon/shared';
import { pinIcon } from './mapPins';
import { SurveyMap } from './SurveyMap';
import { Modal } from './ui';

function ClickToPick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** 地図をクリックして座標を選ぶモーダル */
export function MapPickerModal({
  open,
  onClose,
  onSelect,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (lat: number, lng: number) => void;
  initial: { lat: number; lng: number } | null;
}) {
  // 範囲外の座標（範囲を決める前に保存したデータなど）は選択済みとして扱わない
  const start = initial && isInSurveyArea(initial.lat, initial.lng) ? initial : null;
  const [picked, setPicked] = useState(start);
  const [outside, setOutside] = useState(false);

  return (
    <Modal open={open} onClose={onClose} title="マップで位置を選択" wide>
      <p className="mb-3 text-sm text-gray-600">地図をクリックして観察した位置を選んでください。</p>
      <SurveyMap
        center={start ?? MAP_CENTER}
        zoom={start ? 16 : 14}
        className="h-[420px] overflow-hidden rounded-lg border border-gray-200"
      >
        <ClickToPick
          onPick={(lat, lng) => {
            // 地図は長方形の範囲外へ動かないが、縮小すると範囲の外側（灰色）もクリックできる
            const inside = isInSurveyArea(lat, lng);
            setOutside(!inside);
            if (inside) setPicked({ lat, lng });
          }}
        />
        {picked && <Marker position={picked} icon={pinIcon()} />}
      </SurveyMap>
      <p className="mt-3 text-sm text-gray-700">
        {picked
          ? `選択中の座標: ${picked.lat.toFixed(4)}, ${picked.lng.toFixed(4)}`
          : 'まだ位置が選ばれていません'}
      </p>
      {outside && <p className="mt-1 text-sm text-red-600">地図の範囲外（愛知・岐阜・三重・滋賀の4県）は選べません</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200"
        >
          キャンセル
        </button>
        <button
          type="button"
          disabled={!picked}
          onClick={() => {
            if (picked) onSelect(picked.lat, picked.lng);
            onClose();
          }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          この位置にする
        </button>
      </div>
    </Modal>
  );
}
