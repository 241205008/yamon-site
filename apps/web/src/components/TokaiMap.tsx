import L from 'leaflet';
import { Layers } from 'lucide-react';
import { PMTiles } from 'pmtiles';
import { leafletLayer } from 'protomaps-leaflet';
import { useEffect, useState, type ReactNode } from 'react';
import { MapContainer, TileLayer, ZoomControl, useMap } from 'react-leaflet';
import { TOKAI_BOUNDS } from '@yamon/shared';

/** 基本の地図（Protomaps の東海3県）。開発では vite.config.ts、本番では Pages Functions（functions/map）が返す */
export const MAP_TILES_URL: string = import.meta.env.VITE_MAP_TILES_URL || '/map/tokai.pmtiles';
/** 地図データの読み込み口。ヘッダーと目次のキャッシュを、すべての地図と切り替えで使い回すため1つだけ作る */
const mapSource = new PMTiles(MAP_TILES_URL);
const MAP_ATTRIBUTION =
  '<a href="https://protomaps.com">Protomaps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> の貢献者';

/** 国土地理院の航空写真（全国最新写真・シームレス） */
export const PHOTO_TILE_URL = 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg';
const PHOTO_ATTRIBUTION = '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>';

/** 地図データの最大ズーム（切り出したときの --maxzoom）。これより拡大すると引き伸ばして描く */
const MAP_DATA_MAX_ZOOM = 15;
const MAX_ZOOM = 18;

export const TOKAI_LATLNG_BOUNDS = L.latLngBounds(
  [TOKAI_BOUNDS.south, TOKAI_BOUNDS.west],
  [TOKAI_BOUNDS.north, TOKAI_BOUNDS.east],
);

function ProtomapsLayer() {
  const map = useMap();
  useEffect(() => {
    const layer = leafletLayer({
      url: mapSource,
      flavor: 'light',
      lang: 'ja',
      maxDataZoom: MAP_DATA_MAX_ZOOM,
      maxZoom: MAX_ZOOM,
      bounds: TOKAI_LATLNG_BOUNDS,
      noWrap: true,
      attribution: MAP_ATTRIBUTION,
    }) as unknown as L.GridLayer;
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map]);
  return null;
}

/** 東海3県の全体が収まるところまでしか縮小できないようにする（画面の大きさで変わるので、大きさが変わるたびに計算し直す） */
function LimitZoomOut() {
  const map = useMap();
  useEffect(() => {
    const update = () => {
      const size = map.getSize();
      if (size.x === 0 || size.y === 0) return;
      map.setMinZoom(map.getBoundsZoom(TOKAI_LATLNG_BOUNDS));
    };
    update();
    map.on('resize', update);
    return () => {
      map.off('resize', update);
    };
  }, [map]);
  return null;
}

/**
 * 東海3県の範囲だけを表示する地図（D28）。基本の地図と国土地理院の航空写真を右上のボタンで切り替える。
 * ピンなどは children に渡す。className で外枠の大きさを決める
 */
export function TokaiMap({
  center,
  zoom,
  className = '',
  children,
}: {
  center: { lat: number; lng: number };
  zoom: number;
  className?: string;
  children?: ReactNode;
}) {
  const [photo, setPhoto] = useState(false);

  return (
    <div className={`relative ${className}`}>
      <MapContainer
        center={center}
        zoom={zoom}
        maxZoom={MAX_ZOOM}
        maxBounds={TOKAI_LATLNG_BOUNDS}
        maxBoundsViscosity={1}
        zoomControl={false}
        className="h-full w-full"
      >
        {photo ? (
          <TileLayer
            url={PHOTO_TILE_URL}
            attribution={PHOTO_ATTRIBUTION}
            maxNativeZoom={18}
            maxZoom={MAX_ZOOM}
            bounds={TOKAI_LATLNG_BOUNDS}
          />
        ) : (
          <ProtomapsLayer />
        )}
        <LimitZoomOut />
        {/* 左上はマップ画面の「マップビュー」の表示と重なるため、左下に置く */}
        <ZoomControl position="bottomleft" />
        {children}
      </MapContainer>
      <button
        type="button"
        onClick={() => setPhoto((p) => !p)}
        aria-pressed={photo}
        className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm text-gray-700 shadow-md hover:bg-gray-50"
      >
        <Layers className="h-4 w-4" />
        {photo ? '地図' : '航空写真'}
      </button>
    </div>
  );
}
