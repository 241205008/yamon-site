import type { Role, SessionUser } from '@yamon/shared';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeHeader } from './HomeHeader';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(role: Role, onLogout = () => {}) {
  const user = { id: 'u1', name: 'テスト', email: 't@example.com', role } as SessionUser;
  act(() => {
    root.render(
      <MemoryRouter>
        <HomeHeader user={user} showCreatures={false} onToggleCreatures={() => {}} onLogout={onLogout} />
      </MemoryRouter>,
    );
  });
}

const linkTo = (href: string) => container.querySelector(`a[href="${href}"]`);

describe('ホームのヘッダー', () => {
  it.each(['admin', 'officer', 'member', 'viewer'] as const)('%s にも「使い方」のリンク（/guide）がある', (role) => {
    render(role);
    const guide = linkTo('/guide');
    expect(guide?.textContent).toBe('使い方');
    // 青い文字のリンク（色付きのボタンではない）
    expect(guide?.className).toContain('text-blue-600');
    expect(guide?.className).not.toMatch(/\bbg-blue-600\b/);
  });

  it('「使い方」は、アカウント・ログアウトの右（右端）に並ぶ', () => {
    render('member');
    const group = linkTo('/guide')!.parentElement!;
    expect([...group.children].map((c) => c.textContent)).toEqual(['アカウント', 'ログアウト', '使い方']);
  });

  it.each(['admin', 'officer', 'member', 'viewer'] as const)('%s にも「アカウント」のリンク（/account）がある（#84）', (role) => {
    render(role);
    expect(linkTo('/account')?.textContent).toBe('アカウント');
  });

  it('管理者画面のボタンは管理者だけに出る', () => {
    render('admin');
    expect(linkTo('/admin')).not.toBeNull();
    render('officer');
    expect(linkTo('/admin')).toBeNull();
  });

  it('ログアウトを押すと onLogout が呼ばれる', () => {
    const onLogout = vi.fn();
    render('member', onLogout);
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'ログアウト')!;
    act(() => button.click());
    expect(onLogout).toHaveBeenCalledOnce();
  });
});
