import { describe, expect, it } from 'vitest';
import { dateSchema, optionalCoordinatesSchema, requiredText, timeSchema } from './schemas';

describe('座標', () => {
  it('東海3県の範囲内（名古屋駅）は通る', () => {
    expect(optionalCoordinatesSchema.safeParse({ lat: 35.1709, lng: 136.8815 }).success).toBe(true);
  });

  it('範囲外（東京駅）は通らない', () => {
    expect(optionalCoordinatesSchema.safeParse({ lat: 35.6812, lng: 139.7671 }).success).toBe(false);
  });

  it('座標なしは両方 null で表す', () => {
    expect(optionalCoordinatesSchema.safeParse({ lat: null, lng: null }).success).toBe(true);
  });

  it('片方だけの指定は通らない', () => {
    expect(optionalCoordinatesSchema.safeParse({ lat: 35.17, lng: null }).success).toBe(false);
  });
});

describe('日付と時刻', () => {
  it('存在しない日付は通らない', () => {
    expect(dateSchema.safeParse('2026-02-30').success).toBe(false);
    expect(dateSchema.safeParse('2026-02-28').success).toBe(true);
  });

  it('時刻は 00:00〜23:59', () => {
    expect(timeSchema.safeParse('23:59').success).toBe(true);
    expect(timeSchema.safeParse('24:00').success).toBe(false);
    expect(timeSchema.safeParse('9:00').success).toBe(false);
  });
});

describe('文字列', () => {
  it('前後の空白を除き、空なら通らない', () => {
    const schema = requiredText(10);
    expect(schema.parse('  カブトムシ ')).toBe('カブトムシ');
    expect(schema.safeParse('   ').success).toBe(false);
  });
});
