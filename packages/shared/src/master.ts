/** 生き物のカテゴリ（固定マスター） */
export const CATEGORIES = ['インセクター', 'ママル', 'アクア', 'バーダー'] as const;
export type Category = (typeof CATEGORIES)[number];

/** 時間帯（time.ts の getTimeOfDay で導出する） */
export const TIMES_OF_DAY = ['朝', '昼', '夕方', '夜'] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

export interface MainLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/** 主な場所（固定マスター）。ID は記録から参照されるため変更しないこと */
export const MAIN_LOCATIONS: MainLocation[] = [
  { id: 'loc-central-park', name: '中央公園', lat: 35.127, lng: 136.9671 },
  { id: 'loc-riverside', name: '河川敷エリア', lat: 35.135, lng: 136.975 },
  { id: 'loc-forest-park', name: '森林公園', lat: 35.1408, lng: 136.982 },
  { id: 'loc-pond-square', name: '池のある広場', lat: 35.1188, lng: 136.96 },
  { id: 'loc-mountain-foot', name: '山の麓', lat: 35.1458, lng: 136.99 },
];

/** 地図の初期の中心（名古屋市天白区付近）。主な場所を受け取ったら見直す */
export const MAP_CENTER = { lat: 35.1347, lng: 136.9759 };

export function findMainLocation(id: string | null | undefined): MainLocation | undefined {
  return MAIN_LOCATIONS.find((l) => l.id === id);
}
