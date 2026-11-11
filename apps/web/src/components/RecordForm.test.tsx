import type { CreatureView, RecordInput } from '@yamon/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordForm } from './RecordForm';

// React の act() を使うテストであることを知らせる
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const creature = (id: string, name: string): CreatureView => ({
  id,
  name,
  category: 'アクア',
  memo: '',
  locationProtected: false,
  recordCount: 0,
});

const creatures = [creature('c1', 'アメリカザリガニ'), creature('c2', 'メダカ'), creature('c3', 'カブトムシ')];

let container: HTMLDivElement;
let root: Root;
let onSubmit: ReturnType<typeof vi.fn<(input: RecordInput) => Promise<void>>>;

function render(list = creatures, canAddCreature = false) {
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <RecordForm creatures={list} mainLocations={[]} canAddCreature={canAddCreature} onSubmit={onSubmit} />
      </QueryClientProvider>,
    );
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  onSubmit = vi.fn<(input: RecordInput) => Promise<void>>(async () => {});
  render();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const input = () => container.querySelector<HTMLInputElement>('input[role="combobox"]')!;
const listbox = () => container.querySelector<HTMLElement>('[role="listbox"]');
/** 候補の一覧に出ている生き物の名前（部門を除く） */
const candidates = () =>
  [...container.querySelectorAll<HTMLElement>('[role="option"]')].map((o) => o.textContent!.replace(/\s*\(.*\)$/, ''));
const selectedText = () => container.textContent!.match(/選択中：(\S+?)（/)?.[1] ?? null;

/** React が value の変更を拾えるよう、ネイティブの setter で値を入れてから input を発火する */
function typeSearch(value: string) {
  act(() => {
    input().focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), value);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function clickCandidate(name: string) {
  const option = [...container.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent!.startsWith(name));
  if (!option) throw new Error(`候補にありません: ${name}`);
  act(() => {
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    option.click();
  });
}

function key(k: string, init: KeyboardEventInit = {}) {
  act(() => {
    input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
  });
}

describe('RecordForm の生き物の検索（#95）', () => {
  it('最初は候補を出さず、検索欄を押すと登録されている生き物がすべて出る', () => {
    expect(listbox()).toBeNull();
    act(() => input().focus());
    expect(candidates()).toEqual(['アメリカザリガニ', 'メダカ', 'カブトムシ']);
    expect(container.textContent).toContain('登録されている生き物（3件）');
  });

  it('入力するたびに、一致する生き物だけをその場で出し、件数も出す', () => {
    typeSearch('アメ');
    expect(candidates()).toEqual(['アメリカザリガニ']);
    expect(container.textContent).toContain('1件見つかりました');
  });

  it('ひらがなで入れても、カタカナの名前が候補に出る（#91）', () => {
    typeSearch('めだか');
    expect(candidates()).toEqual(['メダカ']);
  });

  it('候補を押すと選ばれ、一覧が閉じて検索欄は空に戻る', () => {
    typeSearch('かぶと');
    clickCandidate('カブトムシ');
    expect(selectedText()).toBe('カブトムシ');
    expect(listbox()).toBeNull();
    expect(input().value).toBe('');
  });

  it('選んだ後に別の名前で絞っても、候補を押せば選び直せる（#93）', () => {
    typeSearch('メダカ');
    clickCandidate('メダカ');
    typeSearch('アメリカザリガニ');
    expect(candidates()).toEqual(['アメリカザリガニ']);
    clickCandidate('アメリカザリガニ');
    expect(selectedText()).toBe('アメリカザリガニ');
  });

  it('↓↑で候補を移り、Enter で選べる（記録は送らない）', () => {
    act(() => input().focus());
    key('ArrowDown');
    key('Enter');
    expect(selectedText()).toBe('メダカ');
    expect(listbox()).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('日本語の変換中の Enter（かなの確定）では、候補を選ばない', () => {
    typeSearch('めだ');
    key('Enter', { isComposing: true });
    expect(selectedText()).toBeNull();
    expect(listbox()).not.toBeNull();
  });

  it('一覧のスクロールバーや件数の行を押しても、一覧は閉じない（blur を止める）', () => {
    typeSearch('メ');
    const panel = listbox()!.parentElement!;
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    act(() => {
      panel.dispatchEvent(down);
    });
    expect(down.defaultPrevented).toBe(true);
  });

  it('生き物が1件も登録されていなくても、入力すれば「登録されていません」と案内する', () => {
    render([], true);
    typeSearch('メダカ');
    expect(container.textContent).toContain('「メダカ」は登録されていません');
  });

  it('Esc で一覧を閉じる', () => {
    typeSearch('メ');
    key('Escape');
    expect(listbox()).toBeNull();
  });

  it('一致する生き物がないときは「登録されていません」と、登録できる人には登録の案内を出す', () => {
    render(creatures, true);
    typeSearch('クジラ');
    expect(candidates()).toEqual([]);
    expect(container.textContent).toContain('「クジラ」は登録されていません');
    expect(container.textContent).toContain('「新しい生き物を登録」から登録できます');
  });

  it('読み上げ用の役割（combobox・listbox・option）と、選ばれた候補の印を持つ', () => {
    typeSearch('メダカ');
    clickCandidate('メダカ');
    // 選んだ後も検索欄にはフォーカスが残るので、もう一度押して開く
    act(() => input().click());
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(input().getAttribute('aria-controls')).toBe(listbox()!.id);
    const medaka = [...container.querySelectorAll('[role="option"]')].find((o) => o.textContent!.startsWith('メダカ'))!;
    expect(medaka.getAttribute('aria-selected')).toBe('true');
  });
});
