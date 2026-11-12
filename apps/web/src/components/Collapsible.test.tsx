import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '@yamon/shared';
import { CATEGORY_PIN_COLORS, MIXED_PIN_COLOR, pinColorFor } from './mapPins';
import { Collapsible } from './ui';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Collapsible（#109）', () => {
  it('最初は畳まれていて、見出しを押すと開き、もう一度押すと閉じる', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() =>
      root.render(
        <Collapsible title="操作履歴" count="3件">
          <p>中身</p>
        </Collapsible>,
      ),
    );
    const button = container.querySelector('button')!;
    expect(button.textContent).toContain('操作履歴');
    expect(button.textContent).toContain('3件');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).not.toContain('中身');

    act(() => button.click());
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('中身');
    // aria-controls が、開いた中身を指している
    expect(container.querySelector(`[id="${button.getAttribute('aria-controls')}"]`)?.textContent).toBe('中身');

    act(() => button.click());
    expect(container.textContent).not.toContain('中身');
    act(() => root.unmount());
  });
});

describe('マップのピンの色（#109）', () => {
  it('部門ごとに、ユーザーが指定した色を持つ', () => {
    expect(CATEGORY_PIN_COLORS).toEqual({
      アクア: '#005AFF',
      インセクター: '#03AF7A',
      バーダー: '#4DC4FF',
      ママル: '#F6AA00',
    });
    // すべての部門に色がある
    expect(Object.keys(CATEGORY_PIN_COLORS).sort()).toEqual([...CATEGORIES].sort());
  });

  it('地点の部門が1つならその色、混ざっていれば赤', () => {
    expect(pinColorFor(['アクア'])).toBe('#005AFF');
    expect(pinColorFor(['ママル', 'ママル'])).toBe('#F6AA00');
    expect(pinColorFor(['アクア', 'バーダー'])).toBe(MIXED_PIN_COLOR);
    expect(MIXED_PIN_COLOR).toBe('#FF4B00');
  });
});
