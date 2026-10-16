/**
 * HTTP の Range ヘッダー（1つの範囲だけ）を読む。地図データ（PMTiles）は1回に1つの範囲しか要求しない。
 * - ヘッダーがない・形式が違う・複数の範囲：null（ファイル全体を返す）
 * - 範囲がファイルの外：'invalid'（416 を返す）
 */
export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | 'invalid' | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') {
    // 末尾から n バイト
    const suffix = Number(m[2]);
    if (suffix === 0 || size === 0) return 'invalid';
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}
