import L from 'leaflet';
import { CATEGORIES, type Category } from '@yamon/shared';

const PIN_PATH =
  'M12 0C6.5 0 2 4.3 2 9.6 2 16.8 12 26 12 26s10-9.2 10-16.4C22 4.3 17.5 0 12 0z';

/**
 * マップのピンの、部門（カテゴリ）ごとの色（#109、2026-11-12 ユーザー指定）。
 * 色覚の違いがあっても見分けやすい配色（カラーユニバーサルデザイン推奨配色セットのアクセントカラー）から選んだ
 */
export const CATEGORY_PIN_COLORS: Record<Category, string> = {
  アクア: '#005AFF',
  インセクター: '#03AF7A',
  バーダー: '#4DC4FF',
  ママル: '#FF4B00',
};

/** 同じ地点に、複数の部門の記録があるときの色（どの部門の色とも紛れない灰色） */
export const MIXED_PIN_COLOR = '#6B7280';

/** 地点の記録の部門から、ピンの色を決める。部門が1つならその色、混ざっていれば灰色 */
export function pinColorFor(categories: readonly Category[]): string {
  const unique = new Set(categories);
  if (unique.size === 1) return CATEGORY_PIN_COLORS[[...unique][0]];
  return MIXED_PIN_COLOR;
}

/** 凡例に並べる順（CATEGORIES の順） */
export const LEGEND_CATEGORIES = CATEGORIES;

/** ピンの絵（SVG の文字列）。凡例でも同じ形を使う */
export function pinSvg(color: string, size = 24): string {
  const h = Math.round((size * 28) / 24);
  return `<svg width="${size}" height="${h}" viewBox="0 0 24 28" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))"><path d="${PIN_PATH}" fill="${color}" stroke="#fff" stroke-width="1.5"/></svg>`;
}

/** マップのピン。color で色を決める（部門の色、#109）。count が 2 以上なら件数のバッジを付ける */
export function pinIcon(count = 1, color = '#fb2c36'): L.DivIcon {
  const badge =
    count > 1
      ? `<span style="position:absolute;top:-8px;right:-10px;min-width:20px;height:20px;padding:0 4px;border-radius:9999px;background:#1f2937;color:#fff;font-size:11px;font-weight:700;line-height:20px;text-align:center;border:2px solid #fff;box-sizing:border-box">${count}</span>`
      : '';
  return L.divIcon({
    className: 'pin-icon',
    html: `<div style="position:relative;width:24px;height:28px">${pinSvg(color)}${badge}</div>`,
    iconSize: [24, 28],
    iconAnchor: [12, 27],
    tooltipAnchor: [0, -26],
  });
}
