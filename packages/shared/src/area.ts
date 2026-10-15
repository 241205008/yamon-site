/**
 * 地図の範囲：東海3県（愛知・岐阜・三重）を囲む長方形（D28）。
 * 地図データ（Protomaps）の切り出し範囲と同じ値にする。変えるときは docs/MAP_DATA.md の手順で切り出し直す
 */
export const TOKAI_BOUNDS = {
  south: 33.65,
  west: 135.75,
  north: 36.55,
  east: 137.95,
} as const;

/** 座標が地図の範囲（東海3県を囲む長方形）の中にあるか。県境ではなく長方形で判定する */
export function isInTokai(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= TOKAI_BOUNDS.south &&
    lat <= TOKAI_BOUNDS.north &&
    lng >= TOKAI_BOUNDS.west &&
    lng <= TOKAI_BOUNDS.east
  );
}
