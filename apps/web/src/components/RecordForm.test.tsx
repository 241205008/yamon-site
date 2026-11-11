import type { CreatureView } from '@yamon/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <RecordForm creatures={creatures} mainLocations={[]} canAddCreature={false} onSubmit={async () => {}} />
      </QueryClientProvider>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const select = () => container.querySelector<HTMLSelectElement>('#creature-select')!;
/** 画面に見える選択肢（見えない hidden の選択肢は除く） */
const optionTexts = () => [...select().options].filter((o) => !o.hidden).map((o) => o.textContent);
/** 選んだ見た目になっている、見える選択肢 */
const visibleSelected = () => [...select().options].filter((o) => !o.hidden && o.selected).map((o) => o.textContent);

/** React が value の変更を拾えるよう、ネイティブの setter で値を入れてから input を発火する */
function typeSearch(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function choose(id: string) {
  act(() => {
    select().value = id;
    select().dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('RecordForm の生き物の検索（#89）', () => {
  it('検索していないときは「選択してください」とすべての生き物を出す', () => {
    expect(optionTexts()).toEqual(['選択してください', 'アメリカザリガニ (アクア)', 'メダカ (アクア)', 'カブトムシ (アクア)']);
  });

  it('検索中は、一致する生き物だけを出す（「選択してください」は出さない）', () => {
    typeSearch('アメリカザリガニ');
    expect(optionTexts()).toEqual(['アメリカザリガニ (アクア)']);
  });

  it('直前に選んだ生き物が一致しなくても、一覧には残さず、選択は「選択中」で分かる', () => {
    choose('c2');
    typeSearch('アメリカザリガニ');
    expect(optionTexts()).toEqual(['アメリカザリガニ (アクア)']);
    expect(container.textContent).toContain('選択中：メダカ（アクア）');
    expect(container.textContent).toContain('検索した一覧にはありません');
    expect(select().getAttribute('aria-describedby')).toBe('creature-selected');
  });

  it('ひらがなで入れても、カタカナの名前が見つかる（#91）', () => {
    typeSearch('あめりかざりがに');
    expect(optionTexts()).toEqual(['アメリカザリガニ (アクア)']);
  });

  it('選んだ後に検索で絞っても、候補を押せば選び直せる（#93）', () => {
    choose('c2');
    typeSearch('アメリカザリガニ');
    // 候補が選んだ見た目にならず（押すと change が起きる）、値は前の選択のまま
    expect(visibleSelected()).toEqual([]);
    expect(select().value).toBe('c2');
    choose('c1');
    expect(container.textContent).toContain('選択中：アメリカザリガニ（アクア）');
    expect(container.textContent).not.toContain('検索した一覧にはありません');
  });

  it('何も選ばずに検索しても、候補は選んだ見た目にならない（#93）', () => {
    typeSearch('アメリカザリガニ');
    expect(visibleSelected()).toEqual([]);
    expect(select().value).toBe('');
    choose('c1');
    expect(container.textContent).toContain('選択中：アメリカザリガニ（アクア）');
  });

  it('選んだ生き物が一覧からなくなっても（別の人が消した）、「選択してください」は選んだ見た目にならない（#93）', () => {
    choose('c2');
    act(() => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <RecordForm creatures={creatures.filter((c) => c.id !== 'c2')} mainLocations={[]} canAddCreature={false} onSubmit={async () => {}} />
        </QueryClientProvider>,
      );
    });
    expect(visibleSelected()).toEqual([]);
    expect(optionTexts()).toEqual(['選択してください', 'アメリカザリガニ (アクア)', 'カブトムシ (アクア)']);
  });

  it('一致する生き物がないときは「見つかりません」だけを出す', () => {
    typeSearch('クジラ');
    expect(optionTexts()).toEqual(['見つかりません']);
    expect(select().options[0].disabled).toBe(true);
  });
});
