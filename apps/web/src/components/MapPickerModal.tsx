import { useState } from 'react';
import { Marker, useMapEvents } from 'react-leaflet';
import { MAP_CENTER, isInTokai } from '@yamon/shared';
import { pinIcon } from './mapPins';
import { TokaiMap } from './TokaiMap';
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
  const [picked, setPicked] = useState(initial);

  return (
    <Modal open={open} onClose={onClose} title="マップで位置を選択" wide>
      <p className="mb-3 text-sm text-gray-600">地図をクリックして観察した位置を選んでください。</p>
      <TokaiMap
        center={initial ?? MAP_CENTER}
        zoom={initial ? 16 : 14}
        className="h-[420px] overflow-hidden rounded-lg border border-gray-200"
      >
        <ClickToPick
          onPick={(lat, lng) => {
            // 地図は長方形の範囲外へ動かないが、範囲の端の外側をクリックできることがあるため確かめる
            if (isInTokai(lat, lng)) setPicked({ lat, lng });
          }}
        />
        {picked && <Marker position={picked} icon={pinIcon()} />}
      </TokaiMap>
      <p className="mt-3 text-sm text-gray-700">
        {picked
          ? `選択中の座標: ${picked.lat.toFixed(4)}, ${picked.lng.toFixed(4)}`
          : 'まだ位置が選ばれていません'}
      </p>
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
