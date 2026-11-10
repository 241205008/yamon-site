import { ROLES, can, type Role, type SessionUser } from '@yamon/shared';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GUIDES, allGuideImages, guideIdFor } from '../guide/guides';
import { GuidePage } from './GuidePage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let currentUser: SessionUser | null = null;
vi.mock('../lib/auth', () => ({ useCurrentUser: () => currentUser }));

const userWith = (role: Role): SessionUser => ({ id: 'u1', name: 'テスト', email: 't@example.com', role }) as SessionUser;

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
  currentUser = null;
});

function render(url: string) {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/guide" element={<GuidePage />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

const title = () => container.querySelector('main h2')?.textContent;

describe('役割ごとに最初に出すガイド', () => {
  it.each([
    ['admin', '管理者向けの使い方'],
    ['officer', '幹部向けの使い方'],
    ['member', '部員・OB・OG向けの使い方'],
    ['viewer', '部員・OB・OG向けの使い方'],
  ] as const)('%s には「%s」を出す', (role, expected) => {
    currentUser = userWith(role);
    render('/guide');
    expect(title()).toBe(expected);
  });

  it('ログインしていなければ、部員・OB・OG 向けを出し、戻り先はログイン画面', () => {
    render('/guide');
    expect(title()).toBe('部員・OB・OG向けの使い方');
    expect(container.textContent).toContain('ログインに戻る');
  });

  it('?for= で、ほかの役割のガイドも見られる', () => {
    currentUser = userWith('member');
    render('/guide?for=admin');
    expect(title()).toBe('管理者向けの使い方');
    expect(container.textContent).toContain('メンバーを招待する');
  });

  it('?for= が正しくなければ、自分の役割のガイドを出す', () => {
    currentUser = userWith('officer');
    render('/guide?for=unknown');
    expect(title()).toBe('幹部向けの使い方');
  });

  it('どのガイドにも「はじめに」（ログイン・登録・パスワード再設定）がある', () => {
    for (const g of GUIDES) {
      render(`/guide?for=${g.id}`);
      for (const id of ['register', 'login', 'password-reset']) {
        expect(container.querySelector(`section#${id}`)).not.toBeNull();
      }
    }
  });

  it('3つのタブがあり、今のガイドに aria-current が付く', () => {
    currentUser = userWith('admin');
    render('/guide');
    const tabs = [...container.querySelectorAll('nav[aria-label="ガイドの種類"] a')];
    expect(tabs.map((a) => a.getAttribute('href'))).toEqual(['/guide?for=member', '/guide?for=officer', '/guide?for=admin']);
    expect(tabs[2].getAttribute('aria-current')).toBe('page');
  });
});

describe('ガイドの中身', () => {
  it('すべての役割が、どれか1つのガイドの対象になっていて、guideIdFor と食い違わない', () => {
    for (const role of ROLES) {
      const owners = GUIDES.filter((g) => g.roles.includes(role));
      expect(owners).toHaveLength(1);
      expect(owners[0].id).toBe(guideIdFor(role));
    }
  });

  it('幹部向け・管理者向けで説明する操作は、その役割の権限と食い違わない（MVP 2章）', () => {
    // 幹部向け：位置を保護する印。部員にはできない
    expect(can('officer', 'creatures.protect')).toBe(true);
    expect(can('member', 'creatures.protect')).toBe(false);
    // 管理者向け：招待・メンバー管理・主な場所・地図データ・ほかの人の観察会。幹部にはできない
    for (const p of ['users.manage', 'mainLocations.manage', 'mapData.update', 'events.editAny'] as const) {
      expect(can('admin', p)).toBe(true);
      expect(can('officer', p)).toBe(false);
    }
    // OB・OG は見るだけ
    for (const p of ['records.create', 'records.editOwn', 'events.create', 'creatures.manage'] as const) {
      expect(can('viewer', p)).toBe(false);
    }
  });

  it('ガイドで使う画像が、すべて public/guide-images にある', () => {
    const files = allGuideImages();
    expect(files.length).toBeGreaterThan(0);
    // public/ の中身は import できないので、ファイル名だけを集める
    const present = Object.keys(import.meta.glob('../../public/guide-images/*.webp')).map((p) => p.split('/').pop());
    for (const f of files) expect(present, f).toContain(f);
  });

  it('セクションの id は、ガイドの中で重ならない（ページ内リンクが正しく飛ぶ）', () => {
    for (const g of GUIDES) {
      render(`/guide?for=${g.id}`);
      const ids = [...container.querySelectorAll('section[id]')].map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
