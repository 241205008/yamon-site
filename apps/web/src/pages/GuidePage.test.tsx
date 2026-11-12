import { ROLES, can, type Role, type SessionUser } from '@yamon/shared';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEPARTMENTS, GETTING_STARTED, GUIDES, allGuideImages, findSection, guideIdFor } from '../guide/guides';
import imageSizes from '../guide/imageSizes.json';
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
  it.each([
    ['officer', '幹部は、各部門（インセクター・ママル・アクア・バーダー）の副リーダーと、サークルの副代表に割り当てます。'],
    ['admin', '管理者は、サークルの代表と、各部門（インセクター・ママル・アクア・バーダー）のリーダーに割り当てます。'],
  ] as const)('%s のガイドの一番最初に、誰に割り当てるかを出す（#103）', (id, text) => {
    render(`/guide?for=${id}`);
    const card = container.querySelector('main h2')!.parentElement!;
    // 見出しのすぐ次に、割り当てがある（説明の文より前）
    const first = card.querySelector('h2')!.nextElementSibling!;
    expect(first.textContent).toContain(text);
  });

  it('部員・OB・OG のガイドには、割り当ての囲みを出さない（見出しの次は説明の文）', () => {
    render('/guide?for=member');
    const lead = GUIDES.find((g) => g.id === 'member')!.lead;
    expect(container.querySelector('main h2')!.nextElementSibling!.textContent).toBe(lead);
  });

  it('割り当ての部門の名前は、生き物のカテゴリ（部門）と同じ', () => {
    expect(DEPARTMENTS).toBe('インセクター・ママル・アクア・バーダー');
  });

  it('すべての役割が、どれか1つのガイドの対象になっていて、guideIdFor と食い違わない', () => {
    for (const role of ROLES) {
      const owners = GUIDES.filter((g) => g.roles.includes(role));
      expect(owners).toHaveLength(1);
      expect(owners[0].id).toBe(guideIdFor(role));
    }
  });

  it('各セクションの操作に要る権限を、そのガイドの役割が持つ。幹部・管理者向けは、一つ下の役割が持たない操作だけ（MVP 2章）', () => {
    const below: Record<string, Role | null> = { member: null, officer: 'member', admin: 'officer' };
    let checked = 0;
    for (const g of GUIDES) {
      const primary = g.roles[0];
      for (const s of g.sections) {
        if (!s.permission) continue;
        checked++;
        expect(can(primary, s.permission), `${g.id}/${s.id}`).toBe(true);
        const lower = below[g.id];
        if (lower) expect(can(lower, s.permission), `${g.id}/${s.id} は ${lower} もできる`).toBe(false);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('部員以上の操作のセクションは、OB・OG にはできない（「部員以上」と書いてある）', () => {
    const member = GUIDES.find((g) => g.id === 'member')!;
    for (const s of member.sections.filter((x) => x.permission)) {
      expect(can('viewer', s.permission!), s.id).toBe(false);
      expect(s.title, s.id).toContain('部員以上');
    }
  });

  it('ガイドで使う画像が、すべて public/guide-images にある', () => {
    const files = allGuideImages();
    expect(files.length).toBeGreaterThan(0);
    // public/ の中身は import できないので、ファイル名だけを集める
    const present = Object.keys(import.meta.glob('../../public/guide-images/*.webp')).map((p) => p.split('/').pop());
    for (const f of files) {
      expect(present, f).toContain(f);
      // 読み込む前に場所を取るための大きさ（capture.mjs が書く）
      expect(imageSizes, f).toHaveProperty(f);
    }
  });

  it('はじめての方への3ステップ・関連する項目・よくある質問のリンク先が、すべてある', () => {
    for (const g of GUIDES) {
      expect(g.quickStart, g.id).toHaveLength(3);
      const refs = [
        ...g.quickStart.map((q) => q.ref),
        ...g.sections.flatMap((s) => s.related ?? []),
        ...g.faq.flatMap((f) => (f.related ? [f.related] : [])),
      ];
      for (const r of refs) expect(findSection(r, g.id), `${g.id} → ${r.guide ?? ''}#${r.id}`).toBeDefined();
    }
    for (const s of GETTING_STARTED) for (const r of s.related ?? []) expect(findSection(r, 'member'), r.id).toBeDefined();
  });

  it('手順・前提・よくある質問が画面に出る', () => {
    render('/guide?for=admin');
    const invite = container.querySelector('section#admin-invite')!;
    expect(invite.querySelectorAll('ol > li')).toHaveLength(4);
    expect(invite.textContent).toContain('前提：');
    expect(container.querySelectorAll('section#faq details').length).toBeGreaterThan(0);
    // ほかのガイドへの関連リンクは ?for= 付き
    expect(container.querySelector('section#admin-basics a[href="/guide?for=officer#protect-creature"]')).not.toBeNull();
  });

  it('セクションの id は、ガイドの中で重ならない（ページ内リンクが正しく飛ぶ）', () => {
    for (const g of GUIDES) {
      render(`/guide?for=${g.id}`);
      const ids = [...container.querySelectorAll('section[id]')].map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
