import { describe, expect, it } from 'vitest';
import { eventInputSchema, recordInputSchema, recorderLabel } from './observations';

const id = '0b6f8a52-3c1d-4e2f-9a7b-1c2d3e4f5a6b';
const record = {
  creatureId: id,
  locationType: 'main',
  mainLocationId: id,
  lat: null,
  lng: null,
  date: '2026-07-15',
  time: '10:30',
};

describe('記録の入力', () => {
  it('省略できる項目は既定値になる', () => {
    expect(recordInputSchema.parse(record)).toMatchObject({ eventId: null, otherLocationName: '', memo: '' });
  });

  it('主な場所を選ばずに「主な場所」は通らない', () => {
    expect(recordInputSchema.safeParse({ ...record, mainLocationId: null }).success).toBe(false);
  });

  it('片方だけの座標は通らない', () => {
    expect(recordInputSchema.safeParse({ ...record, lat: 35.13 }).success).toBe(false);
  });
});

describe('観察会の入力', () => {
  it('主な場所もその他の場所もなければ通らない', () => {
    const base = { name: '会', lat: null, lng: null, date: '2026-07-15', time: '10:00' };
    expect(eventInputSchema.safeParse(base).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...base, otherLocationName: '市民の森' }).success).toBe(true);
  });
});

describe('記録者の表示名', () => {
  it('OB・OG は「OB/OG」、退会した人は「退会済みユーザー」', () => {
    expect(recorderLabel({ name: '山田', role: 'member', status: 'active' })).toBe('山田');
    expect(recorderLabel({ name: '山田', role: 'viewer', status: 'active' })).toBe('OB/OG');
    expect(recorderLabel({ name: '退会済みユーザー', role: 'member', status: 'withdrawn' })).toBe('退会済みユーザー');
  });
});
