import { z } from 'zod';
import type { Category, LocationType, Role, UserStatus } from './master';
import { TIMES_OF_DAY } from './master';
import {
  categorySchema,
  dateSchema,
  idSchema,
  latSchema,
  lngSchema,
  locationTypeSchema,
  optionalText,
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
  name: z.string().trim().min(1, '生き物の名前を入力してください').max(50),
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

/** 主な場所の追加・編集（管理者だけ、D27）。座標は4県の範囲内に限る */
export const mainLocationInputSchema = z.object({
  name: z.string().trim().min(1, '場所の名前を入力してください').max(50),
  lat: latSchema,
  lng: lngSchema,
  /** false にすると「使わない」場所になり、選択肢から外れる。省くと、追加では true、編集では今のまま */
  isActive: z.boolean().optional(),
});
export type MainLocationInput = z.input<typeof mainLocationInputSchema>;

export const eventInputSchema = z
  .object({
    name: z.string().trim().min(1, '観察会名を入力してください').max(100),
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
  /** この場所の記録の件数 */
  recordCount: number;
  /** この場所の観察会の件数（記録か観察会がある場所は削除できない、D37） */
  eventCount: number;
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
  /** 条件に合う記録の総数。続き（cursor を指定した読み込み）では数え直さず null */
  total: number | null;
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
