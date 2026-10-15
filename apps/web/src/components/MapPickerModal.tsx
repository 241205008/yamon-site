import { useState } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import { MAP_CENTER } from '@yamon/shared';
import { pinIcon } from './mapPins';
import { Modal } from './ui';

export const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

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
      <div className="h-[420px] overflow-hidden rounded-lg border border-gray-200">
        <MapContainer
          center={initial ?? MAP_CENTER}
          zoom={initial ? 16 : 14}
          className="h-full w-full"
        >
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
          <ClickToPick onPick={(lat, lng) => setPicked({ lat, lng })} />
          {picked && <Marker position={picked} icon={pinIcon()} />}
        </MapContainer>
      </div>
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
