import { describe, expect, it } from 'vitest';
import { formatRemaining, getTimeOfDay, isoToJstDate, monthOf, nowTimeJst, todayJst } from './time';

describe('JST の日付', () => {
  it('UTC 15:00（JST 翌0時）は JST の翌日になる', () => {
    const d = new Date('2026-04-09T15:30:00Z');
    expect(todayJst(d)).toBe('2026-04-10');
    expect(nowTimeJst(d)).toBe('00:30');
  });

  it('UTC 14:59 は JST の同じ日の 23:59', () => {
    const d = new Date('2026-04-09T14:59:00Z');
    expect(todayJst(d)).toBe('2026-04-09');
    expect(nowTimeJst(d)).toBe('23:59');
  });

  it('ISO を JST の日付にする', () => {
    expect(isoToJstDate('2026-12-31T20:00:00Z')).toBe('2027-01-01');
  });
});

describe('getTimeOfDay', () => {
  it.each([
    ['05:59', '夜'],
    ['06:00', '朝'],
    ['11:59', '朝'],
    ['12:00', '昼'],
    ['16:59', '昼'],
    ['17:00', '夕方'],
    ['19:59', '夕方'],
    ['20:00', '夜'],
    ['00:00', '夜'],
  ])('%s → %s', (time, expected) => {
    expect(getTimeOfDay(time)).toBe(expected);
  });
});

describe('その他', () => {
  it('monthOf', () => expect(monthOf('2026-07-15')).toBe(7));
  it('formatRemaining', () => {
    expect(formatRemaining(61_500)).toBe('01:01');
    expect(formatRemaining(-5)).toBe('00:00');
  });
});
