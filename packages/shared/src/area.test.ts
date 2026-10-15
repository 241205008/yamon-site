import { describe, expect, it } from 'vitest';
import { isInTokai } from './area';
import { MAIN_LOCATIONS, MAP_CENTER } from './master';

describe('isInTokai', () => {
  it('名古屋・岐阜・津・県境に近い地点は範囲内', () => {
    expect(isInTokai(35.1815, 136.9066)).toBe(true); // 名古屋駅
    expect(isInTokai(35.4233, 136.7607)).toBe(true); // 岐阜市
    expect(isInTokai(34.7303, 136.5086)).toBe(true); // 津市
    expect(isInTokai(36.1461, 137.2522)).toBe(true); // 高山市
    expect(isInTokai(33.8, 136.05)).toBe(true); // 紀宝町付近（三重の南端）
  });

  it('東京・大阪・範囲の外の座標は範囲外', () => {
    expect(isInTokai(35.6812, 139.7671)).toBe(false); // 東京駅
    expect(isInTokai(34.7025, 135.4959)).toBe(false); // 大阪駅
    expect(isInTokai(33.6, 136.9)).toBe(false);
    expect(isInTokai(36.6, 136.9)).toBe(false);
  });

  it('数値でない値は範囲外', () => {
    expect(isInTokai(Number.NaN, 136.9)).toBe(false);
    expect(isInTokai(35.1, Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('地図の初期位置と主な場所はすべて範囲内', () => {
    expect(isInTokai(MAP_CENTER.lat, MAP_CENTER.lng)).toBe(true);
    MAIN_LOCATIONS.forEach((l) => expect(isInTokai(l.lat, l.lng)).toBe(true));
  });
});
