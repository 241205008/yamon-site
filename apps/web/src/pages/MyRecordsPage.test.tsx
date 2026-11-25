import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CreatureView, RecordPage, RecordView, Role, SessionUser } from '@yamon/shared';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MyRecordsPage } from './MyRecordsPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let currentUser: SessionUser;
vi.mock('../lib/auth', () => ({ useCurrentUser: () => currentUser }));

const apiFetch = vi.fn();
vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  apiFetch: (path: string, options?: unknown) => apiFetch(path, options),
}));

const creatures: CreatureView[] = [
  { id: 'c1', name: 'ニホンヤモリ', category: 'ハーペター' } as unknown as CreatureView,
  { id: 'c2', name: 'アマガエル', category: 'ハーペター' } as unknown as CreatureView,
];

const record = (id: string, extra: Partial<RecordView> = {}): RecordView =>
  ({
    id,
    creatureId: 'c1',
    creatureName: 'ニホンヤモリ',
    category: 'ハーペター',
    eventId: null,
    locationType: 'other',
    mainLocationId: null,
    locationName: '裏山',
    lat: null,
    lng: null,
    locationHidden: false,
    date: '2026-01-01',
    time: '10:00',
    memo: '',
    userId: 'u1',
    recorderName: 'テスト',
    createdAt: '2026-01-01T01:00:00Z',
    ...extra,
  }) as RecordView;

/** /api/records の問い合わせの URL を受け取り、返すページを決める */
let recordPages: (q: URLSearchParams) => RecordPage;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // jsdom には scrollIntoView がない（編集を押すとフォームまでスクロールする）
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (path: string) => {
    const url = new URL(path, 'http://localhost');
    if (url.pathname === '/api/creatures') return { creatures };
    if (url.pathname === '/api/main-locations') return { locations: [] };
    if (url.pathname === '/api/records') return recordPages(url.searchParams);
    throw new Error(`想定していない問い合わせ：${path}`);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(role: Role) {
  currentUser = { id: 'u1', name: 'テスト', email: 't@example.com', role } as SessionUser;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <MyRecordsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  await flush();
}

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));
const recordQueries = () =>
  apiFetch.mock.calls.map(([p]) => new URL(p as string, 'http://localhost')).filter((u) => u.pathname === '/api/records');
const buttons = (label: string) => [...container.querySelectorAll('button')].filter((b) => b.textContent?.includes(label));
const input = (label: string) => container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;

function setValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('自分の記録の画面（#120）', () => {
  it('mine=1 で自分の記録を読み、「さらに表示」で続きを読む', async () => {
    recordPages = (q) =>
      q.get('cursor')
        ? { records: [record('r3', { date: '2025-05-01' })], nextCursor: null, total: null }
        : { records: [record('r1'), record('r2')], nextCursor: 'next', total: 3 };
    await render('member');

    const first = recordQueries()[0];
    expect(first.searchParams.get('mine')).toBe('1');
    expect(container.textContent).toContain('3件');
    expect(container.querySelectorAll('article')).toHaveLength(2);

    await act(async () => buttons('さらに表示（残り1件）')[0].click());
    await flush();
    expect(recordQueries().at(-1)!.searchParams.get('cursor')).toBe('next');
    expect(container.querySelectorAll('article')).toHaveLength(3);
    expect(buttons('さらに表示')).toHaveLength(0);
  });

  it('部員には編集・削除のボタンを出し、編集を押すと記録のフォームが開く', async () => {
    recordPages = () => ({ records: [record('r1', { eventId: 'e1' })], nextCursor: null, total: 1 });
    await render('member');
    expect(container.querySelector('button[aria-label="編集"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="削除"]')).not.toBeNull();
    // 観察会に紐づいた記録は、その観察会へのリンクも出す
    expect(container.querySelector('a[href="/event-detail/e1"]')).not.toBeNull();

    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="編集"]')!.click());
    await flush();
    expect(container.textContent).toContain('記録を編集中：ニホンヤモリ');
    expect(container.textContent).toContain('観察記録を編集');
  });

  it('OB・OG には見るだけで出し、編集・削除のボタンを出さない', async () => {
    recordPages = () => ({ records: [record('r1')], nextCursor: null, total: 1 });
    await render('viewer');
    expect(container.querySelectorAll('article')).toHaveLength(1);
    expect(container.querySelector('button[aria-label="編集"]')).toBeNull();
    expect(container.querySelector('button[aria-label="削除"]')).toBeNull();
    expect(container.textContent).toContain('見ることだけができます');
  });

  it('生き物（ひらがなでも当たる）と期間で、API に絞り込みを渡す', async () => {
    recordPages = () => ({ records: [], nextCursor: null, total: 0 });
    await render('member');
    expect(container.textContent).toContain('まだ記録がありません');

    setValue(container.querySelector<HTMLInputElement>('input[role="combobox"]')!, 'あまがえる');
    const option = [...container.querySelectorAll('[role="option"]')];
    expect(option.map((o) => o.textContent)).toEqual(['アマガエル (ハーペター)']);
    await act(async () => (option[0] as HTMLElement).click());
    setValue(input('いつから'), '2026-04-01');
    setValue(input('いつまで'), '2026-04-30');
    await flush();

    const last = recordQueries().at(-1)!.searchParams;
    expect(last.get('mine')).toBe('1');
    expect(last.get('creatureId')).toBe('c2');
    expect(last.get('from')).toBe('2026-04-01');
    expect(last.get('to')).toBe('2026-04-30');
    expect(container.textContent).toContain('条件に合う記録はありません');

    await act(async () => buttons('絞り込みを解除する')[0].click());
    await flush();
    const cleared = recordQueries().at(-1)!.searchParams;
    expect([cleared.get('creatureId'), cleared.get('from'), cleared.get('to')]).toEqual([null, null, null]);
  });

  it('期間が逆のときは知らせ、逆の期間では問い合わせない', async () => {
    recordPages = () => ({ records: [], nextCursor: null, total: 0 });
    await render('member');
    setValue(input('いつから'), '2026-05-01');
    setValue(input('いつまで'), '2026-04-01');
    await flush();
    expect(container.textContent).toContain('「いつから」は「いつまで」より前の日付');
    expect(recordQueries().some((u) => u.searchParams.get('from') === '2026-05-01' && u.searchParams.has('to'))).toBe(false);
  });
});
