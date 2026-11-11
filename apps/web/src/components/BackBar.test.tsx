import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { BackBar } from './ui';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('BackBar（#97）', () => {
  it('ホームへ戻るリンクは、黒い文字で表示する', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() =>
      root.render(
        <MemoryRouter>
          <BackBar to="/" label="ホーム画面に戻る" />
        </MemoryRouter>,
      ),
    );
    const link = container.querySelector('a[href="/"]')!;
    expect(link.textContent).toBe('ホーム画面に戻る');
    expect(link.className).toContain('text-gray-900');
    expect(link.className).not.toContain('text-gray-400');
    act(() => root.unmount());
  });
});
