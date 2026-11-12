import type { AdminUser } from '@yamon/shared';
import { describe, expect, it } from 'vitest';
import { filterUsers } from './AdminPage';

const user = (id: string, name: string, email: string | null): AdminUser =>
  ({ id, name, email, role: 'member', status: 'active', protected: false, createdAt: '2026-11-12T00:00:00Z' }) as AdminUser;

const users = [
  user('u1', '山田 太郎', 'yamada@example.com'),
  user('u2', '佐藤 花子', 'Sato.Hanako@Example.com'),
  user('u3', '退会済みユーザー', null),
];

describe('登録済みユーザーの絞り込み（#109）', () => {
  it('検索語が空なら全員', () => {
    expect(filterUsers(users, '').map((u) => u.id)).toEqual(['u1', 'u2', 'u3']);
    expect(filterUsers(users, '  ').map((u) => u.id)).toEqual(['u1', 'u2', 'u3']);
  });

  it('メールアドレスの一部で絞り込む（大文字小文字・全角半角は区別しない）', () => {
    expect(filterUsers(users, 'yamada').map((u) => u.id)).toEqual(['u1']);
    expect(filterUsers(users, 'sato.hanako').map((u) => u.id)).toEqual(['u2']);
    expect(filterUsers(users, 'ＳＡＴＯ').map((u) => u.id)).toEqual(['u2']);
  });

  it('名前でも探せる。メールアドレスがない人（退会済み）でも落ちない', () => {
    expect(filterUsers(users, '花子').map((u) => u.id)).toEqual(['u2']);
    expect(filterUsers(users, 'example.com').map((u) => u.id)).toEqual(['u1', 'u2']);
  });
});
