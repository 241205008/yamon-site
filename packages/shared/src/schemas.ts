import { z } from 'zod';
import { TOKAI_BOUNDS } from './area';
import { CATEGORIES, LOCATION_TYPES } from './master';

/**
 * API の入力チェック（zod）。フロントのフォームと API の両方から使う（D16・D20）。
 * 各機能の入力スキーマは、その機能の Issue でここに足す。
 */

export const idSchema = z.uuid();

/** "YYYY-MM-DD"（JST の日付、D10）。存在しない日付（2月30日など）は通さない */
export const dateSchema = z.iso.date();

/** "HH:MM"（JST の時刻、D10） */
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '時刻は HH:MM で入力してください');

/** 範囲は地図と同じ東海3県を囲む長方形（area.ts の TOKAI_BOUNDS、D28）。範囲外の座標は API でも受け付けない */
export const latSchema = z
  .number()
  .min(TOKAI_BOUNDS.south, '東海3県の範囲外の座標です')
  .max(TOKAI_BOUNDS.north, '東海3県の範囲外の座標です');

export const lngSchema = z
  .number()
  .min(TOKAI_BOUNDS.west, '東海3県の範囲外の座標です')
  .max(TOKAI_BOUNDS.east, '東海3県の範囲外の座標です');

/** 座標。片方だけの指定は受け付けない（座標がないときは両方 null、D3） */
export const optionalCoordinatesSchema = z.union([
  z.object({ lat: latSchema, lng: lngSchema }),
  z.object({ lat: z.null(), lng: z.null() }),
]);

export const categorySchema = z.enum(CATEGORIES);
export const locationTypeSchema = z.enum(LOCATION_TYPES);

/** 前後の空白を除いて、1文字以上・max 文字以下 */
export const requiredText = (max: number) => z.string().trim().min(1, '入力してください').max(max);

/** 空でもよい自由記述（メモなど） */
export const optionalText = (max: number) => z.string().trim().max(max).default('');

/** API がエラーのときに返す本文。入力チェックの失敗では issues に項目ごとの理由が入る */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    issues?: { path: string; message: string }[];
  };
}
