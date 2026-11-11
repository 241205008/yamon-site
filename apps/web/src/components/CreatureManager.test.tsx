import type { CreatureView } from '@yamon/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatureManager } from './CreatureManager';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const longMemo = '川魚の中でも親しみ深いやつ。\n大きくなると体の中心に入るボーダーがチャームポイント。\n飼育した際に8年くらい生き続けて驚いたのはいい思い出。';
const creature: CreatureView = {
  id: 'c1',
  name: 'アブラハヤ',
  category: 'アクア',
  memo: longMemo,
  locationProtected: true,
  recordCount: 2,
};

/** API の偽物。PUT の中身を覚える */
const sent: { url: string; body: unknown }[] = [];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  sent.length = 0;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT' || init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body));
      sent.push({ url, body });
      return Response.json({ creature: { ...creature, ...body } });
    }
    if (url.startsWith('/api/creatures')) return Response.json({ creatures: [creature] });
    throw new Error(`想定外の URL: ${url}`);
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

/** 非同期の処理（fetch → setState）を流し切る */
async function flush() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function render(canProtect = true) {
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CreatureManager canManage canProtect={canProtect} />
      </QueryClientProvider>,
    );
  });
  await flush();
}

const buttonByText = (text: string | RegExp) =>
  [...document.querySelectorAll('button')].find((b) => (typeof text === 'string' ? b.textContent === text : text.test(b.textContent ?? '')));
const dialog = () => document.querySelector('[role="dialog"]');

describe('生き物の編集（#97）', () => {
  it('鉛筆ボタンを押すと、「名前・カテゴリを編集」と「メモを編集」の2つを選べる', async () => {
    await render();
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="アブラハヤを編集"]')!.click());
    expect(dialog()?.getAttribute('aria-label')).toBe('「アブラハヤ」の何を編集しますか？');
    expect(buttonByText(/^名前・カテゴリを編集/)).toBeDefined();
    expect(buttonByText(/^メモを編集/)).toBeDefined();
  });

  it('「名前・カテゴリを編集」では、名前・カテゴリ・位置の保護を直し、メモは今のまま送る', async () => {
    await render();
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="アブラハヤを編集"]')!.click());
    act(() => buttonByText(/^名前・カテゴリを編集/)!.click());
    expect(dialog()?.getAttribute('aria-label')).toBe('名前・カテゴリを編集');
    expect(document.querySelector('#cr-name')).not.toBeNull();
    expect(document.querySelector('#cr-memo')).toBeNull();
    act(() => buttonByText('保存')!.click());
    await flush();
    expect(sent[0].body).toEqual({ name: 'アブラハヤ', category: 'アクア', memo: longMemo, locationProtected: true });
  });

  it('「メモを編集」では、メモの全体を入力欄に出し、メモだけを書き換えて送る（位置の保護の印は送らない）', async () => {
    await render();
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="アブラハヤを編集"]')!.click());
    act(() => buttonByText(/^メモを編集/)!.click());
    expect(dialog()?.getAttribute('aria-label')).toBe('「アブラハヤ」のメモを編集');
    const textarea = document.querySelector<HTMLTextAreaElement>('#cr-memo')!;
    expect(textarea.value).toBe(longMemo);
    // 入力欄の中でスクロールさせない（高さを中身に合わせる）
    expect(textarea.className).toContain('overflow-hidden');
    expect(document.querySelector('#cr-name')).toBeNull();

    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, '書き直したメモ');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => buttonByText('保存')!.click());
    await flush();
    expect(sent[0].body).toEqual({ name: 'アブラハヤ', category: 'アクア', memo: '書き直したメモ' });
  });
});
