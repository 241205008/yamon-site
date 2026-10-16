import { z } from 'zod';
import type { Category, LocationType, Role, TimeOfDay, UserStatus } from './master';
import { TIMES_OF_DAY } from './master';
import {
  categorySchema,
  dateSchema,
  idSchema,
  latSchema,
  lngSchema,
  locationTypeSchema,
  optionalText,
  requiredText,
  timeSchema,
} from './schemas';

/**
 * 生き物・観察会・観察記録の API の入力と応答（#13）。
 * 入力はフロントのフォームと API の両方でこのスキーマを使う。
 */

// ---------------------------------------------------------------------------
// 入力
// ---------------------------------------------------------------------------

/** 座標は両方あるか両方 null（片方だけは受け付けない、D3） */
const coordinateFields = {
  lat: latSchema.nullable(),
  lng: lngSchema.nullable(),
};
const coordinatesPaired = (v: { lat: number | null; lng: number | null }) => (v.lat === null) === (v.lng === null);
const COORDINATES_PAIR_MESSAGE = { message: '緯度と経度は両方そろえて指定してください', path: ['lat'] };

export const creatureInputSchema = z.object({
  name: requiredText(50),
  category: categorySchema,
  memo: optionalText(500),
});
export type CreatureInput = z.input<typeof creatureInputSchema>;

export const recordInputSchema = z
  .object({
    creatureId: idSchema,
    /** 観察会に紐づけない記録は null。更新では無視する（記録の観察会は変えない） */
    eventId: idSchema.nullable().default(null),
    locationType: locationTypeSchema,
    /** locationType が 'main' のときだけ使う */
    mainLocationId: idSchema.nullable().default(null),
    /** locationType が 'other' のときの場所名（空なら「その他の場所」） */
    otherLocationName: optionalText(100),
    /** 詳細な座標（任意）。主な場所で省くと、主な場所の座標で記録する */
    ...coordinateFields,
    date: dateSchema,
    time: timeSchema,
    memo: optionalText(2000),
  })
  .refine(coordinatesPaired, COORDINATES_PAIR_MESSAGE)
  .refine((v) => v.locationType !== 'main' || v.mainLocationId !== null, {
    message: '主な場所を選択してください',
    path: ['mainLocationId'],
  });
export type RecordInput = z.input<typeof recordInputSchema>;

export const eventInputSchema = z
  .object({
    name: requiredText(100),
    /** 主な場所を選んだときの ID。その他の場所なら null */
    mainLocationId: idSchema.nullable().default(null),
    otherLocationName: optionalText(100),
    /** 現在位置（任意）。主な場所で省くと、主な場所の座標を使う */
    ...coordinateFields,
    date: dateSchema,
    time: timeSchema,
  })
  .refine(coordinatesPaired, COORDINATES_PAIR_MESSAGE)
  .refine((v) => v.mainLocationId !== null || v.otherLocationName.trim() !== '', {
    message: '場所を選択してください',
    path: ['otherLocationName'],
  });
export type EventInput = z.input<typeof eventInputSchema>;

/** 記録一覧の1回の取得件数の上限（サーバー側でページングする） */
export const RECORDS_PAGE_MAX = 100;

const optionalId = idSchema.optional();

/** GET /api/records のクエリ。cursor は前回の応答の nextCursor */
export const recordListQuerySchema = z.object({
  eventId: optionalId,
  limit: z.coerce.number().int().min(1).max(RECORDS_PAGE_MAX).default(20),
  cursor: z.string().max(500).optional(),
});

/** GET /api/records/map のクエリ（マップの絞り込み。すべて AND 条件） */
export const mapQuerySchema = z.object({
  creatureId: optionalId,
  month: z.coerce.number().int().min(1).max(12).optional(),
  timeOfDay: z.enum(TIMES_OF_DAY).optional(),
});

// ---------------------------------------------------------------------------
// 応答
// ---------------------------------------------------------------------------

export interface CreatureView {
  id: string;
  name: string;
  category: Category;
  memo: string;
  /** 位置を保護する生き物か（D24） */
  locationProtected: boolean;
  /** この生き物の記録の件数（記録がある生き物は削除できない、D9） */
  recordCount: number;
}

export interface MainLocationView {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** false なら「使わない」場所。選択肢には出さず、過去の記録の表示には残す（D27） */
  isActive: boolean;
}

export interface RecordView {
  id: string;
  creatureId: string;
  creatureName: string;
  category: Category;
  eventId: string | null;
  locationType: LocationType;
  mainLocationId: string | null;
  /** 表示用の場所名。主な場所は今の名前を返す（名前を直すと過去の記録にも反映される） */
  locationName: string;
  /** 座標がない記録は null */
  lat: number | null;
  lng: number | null;
  date: string;
  time: string;
  memo: string;
  userId: string;
  /** 記録者の表示名（OB・OG は「OB/OG」、退会した人は「退会済みユーザー」） */
  recorderName: string;
  createdAt: string;
}

export interface RecordPage {
  records: RecordView[];
  /** 続きがなければ null */
  nextCursor: string | null;
  /** 条件に合う記録の総数 */
  total: number;
}

export interface EventView {
  id: string;
  name: string;
  mainLocationId: string | null;
  locationName: string;
  lat: number | null;
  lng: number | null;
  date: string;
  time: string;
  createdBy: string;
  createdAt: string;
  recordCount: number;
  /** この観察会で記録された生き物（重複なし） */
  creatures: { id: string; name: string; category: Category }[];
}

export interface EventListResponse {
  events: EventView[];
  stats: {
    eventCount: number;
    /** 観察会に紐づく記録の数 */
    recordCount: number;
    /** 観察会で記録された生き物の種類 */
    speciesCount: number;
  };
}

/** 場所別一覧：主な場所ごとに、記録された生き物と観察回数（多い順） */
export interface LocationStatsResponse {
  locations: {
    mainLocationId: string;
    creatures: { id: string; name: string; category: Category; memo: string; count: number }[];
  }[];
}

// ---------------------------------------------------------------------------
// 表示
// ---------------------------------------------------------------------------

export const WITHDRAWN_USER_LABEL = '退会済みユーザー';
export const VIEWER_RECORDER_LABEL = 'OB/OG';

/** 記録者として表示する名前（MVP 2章「アカウントの状態」）。OB・OG の本人の名前は出さない（D26） */
export function recorderLabel(user: { name: string; role: Role; status: UserStatus }): string {
  if (user.status === 'withdrawn') return WITHDRAWN_USER_LABEL;
  if (user.role === 'viewer') return VIEWER_RECORDER_LABEL;
  return user.name;
}

/** 時間帯ごとの時刻の範囲 [開始, 終了)（time.ts の getTimeOfDay と同じ区切り。夜は日付をまたぐ） */
export const TIME_OF_DAY_RANGES: Record<TimeOfDay, { from: string; to: string }> = {
  朝: { from: '06:00', to: '12:00' },
  昼: { from: '12:00', to: '17:00' },
  夕方: { from: '17:00', to: '20:00' },
  夜: { from: '20:00', to: '06:00' },
};
