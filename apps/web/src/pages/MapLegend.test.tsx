import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { MapLegend } from './MapPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('マップの凡例（#109）', () => {
  it('地図の下に件数と「凡例の色について」を出し、押すと部門の色の説明が開く', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<MapLegend summary="12件の記録" />));

    expect(container.textContent).toContain('12件の記録');
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent === '凡例の色について')!;
    const legend = container.querySelector<HTMLElement>(`[id="${button.getAttribute('aria-controls')}"]`)!;
    // 閉じている間も、aria-controls の先はある（hidden で隠す）
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(legend.hidden).toBe(true);

    act(() => button.click());
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(legend.hidden).toBe(false);
    expect([...legend.querySelectorAll('li')].map((li) => li.textContent?.replace('N', ''))).toEqual([
      'インセクター',
      'ママル',
      'アクア',
      'バーダー',
      '複数の部門',
      '同じ地点の記録の数',
    ]);

    act(() => button.click());
    expect(legend.hidden).toBe(true);
    act(() => root.unmount());
  });
});
