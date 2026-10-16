/**
 * 観察と地図の範囲：愛知・岐阜・三重・滋賀の4県を囲む長方形（D28、2026-10-16 に滋賀を追加）。
 * 地図データ（Protomaps）の切り出し範囲と同じ値にする。変えるときは docs/MAP_DATA.md の手順で切り出し直す。
 * 西端は滋賀県の西端（東経135.76度付近）に余裕を持たせた値にしている
 */
export const SURVEY_BOUNDS = {
  south: 33.65,
  west: 135.7,
  north: 36.55,
  east: 137.95,
} as const;

/** 座標が観察の範囲（4県を囲む長方形）の中にあるか。県境ではなく長方形で判定する */
export function isInSurveyArea(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= SURVEY_BOUNDS.south &&
    lat <= SURVEY_BOUNDS.north &&
    lng >= SURVEY_BOUNDS.west &&
    lng <= SURVEY_BOUNDS.east
  );
}
