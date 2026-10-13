import L from 'leaflet';

const PIN_PATH =
  'M12 0C6.5 0 2 4.3 2 9.6 2 16.8 12 26 12 26s10-9.2 10-16.4C22 4.3 17.5 0 12 0z';

/** デザインの赤いピン。count が 2 以上なら青い件数バッジを付ける */
export function pinIcon(count = 1, color = '#fb2c36'): L.DivIcon {
  const multi = count > 1;
  const fill = multi ? '#f26b6b' : color;
  const badge = multi
    ? `<span style="position:absolute;top:-8px;right:-10px;min-width:20px;height:20px;padding:0 4px;border-radius:9999px;background:#155dfc;color:#fff;font-size:11px;font-weight:700;line-height:20px;text-align:center;border:2px solid #fff;box-sizing:border-box">${count}</span>`
    : '';
  return L.divIcon({
    className: 'pin-icon',
    html: `<div style="position:relative;width:24px;height:28px"><svg width="24" height="28" viewBox="0 0 24 28" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))"><path d="${PIN_PATH}" fill="${fill}"/></svg>${badge}</div>`,
    iconSize: [24, 28],
    iconAnchor: [12, 27],
    tooltipAnchor: [0, -26],
  });
}
