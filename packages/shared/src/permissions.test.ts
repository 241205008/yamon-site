import { describe, expect, it } from 'vitest';
import { ROLES } from './master';
import { can, canActOn, PERMISSIONS } from './permissions';

describe('PERMISSIONS（MVP 2章「できること」）', () => {
  it('どの権限にも、ROLES にない役割は入っていない', () => {
    for (const roles of Object.values(PERMISSIONS)) {
      for (const role of roles) expect(ROLES).toContain(role);
    }
  });

  it('OB・OG（viewer）は見ることしかできない', () => {
    const allowed = Object.keys(PERMISSIONS).filter((p) => can('viewer', p as keyof typeof PERMISSIONS));
    expect(allowed).toEqual(['records.view']);
  });

  it('管理者だけができること', () => {
    for (const p of ['events.editAny', 'mainLocations.manage', 'mapData.update', 'users.manage'] as const) {
      expect(ROLES.filter((r) => can(r, p))).toEqual(['admin']);
    }
  });

  it('保護対象の正確な位置と保護の印は、管理者と幹部だけ', () => {
    for (const p of ['locations.viewExact', 'creatures.protect'] as const) {
      expect(ROLES.filter((r) => can(r, p))).toEqual(['admin', 'officer']);
    }
  });

  it('記録の追加・観察会の作成・生き物の管理は、OB・OG 以外', () => {
    for (const p of ['records.create', 'events.create', 'creatures.manage'] as const) {
      expect(ROLES.filter((r) => can(r, p))).toEqual(['admin', 'officer', 'member']);
    }
  });
});

describe('canActOn（作成者本人の判定）', () => {
  const member = { id: 'u1', role: 'member' as const };
  const viewer = { id: 'u2', role: 'viewer' as const };
  const admin = { id: 'u3', role: 'admin' as const };

  it('記録は本人だけが編集できる（管理者でも他人の記録は不可）', () => {
    expect(canActOn(member, 'u1', 'records.editOwn')).toBe(true);
    expect(canActOn(member, 'u9', 'records.editOwn')).toBe(false);
    expect(canActOn(admin, 'u9', 'records.editOwn')).toBe(false);
  });

  it('OB・OG は自分の過去の記録も編集できない', () => {
    expect(canActOn(viewer, 'u2', 'records.editOwn')).toBe(false);
  });

  it('観察会は作った本人と管理者が編集できる', () => {
    expect(canActOn(member, 'u1', 'events.editOwn', 'events.editAny')).toBe(true);
    expect(canActOn(member, 'u9', 'events.editOwn', 'events.editAny')).toBe(false);
    expect(canActOn(admin, 'u9', 'events.editOwn', 'events.editAny')).toBe(true);
  });

  it('作成者がいないもの（null）は、any の権限がなければ操作できない', () => {
    expect(canActOn(member, null, 'events.editOwn')).toBe(false);
  });
});
