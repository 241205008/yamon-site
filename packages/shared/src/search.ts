/**
 * 検索で比べるために、文字の書き方の違いをそろえる（#91）。
 * - 全角・半角をそろえる（NFKC。半角カナ「ｱｷｱｶﾈ」→「アキアカネ」、全角英数字→半角）
 * - ひらがなをカタカナにそろえる（「あきあかね」→「アキアカネ」）
 * - 英字の大文字・小文字を区別しない
 *
 * 漢字と読み（「蛍」と「ほたる」）は、読みのデータがないので結び付けない。
 */
export function normalizeForSearch(text: string): string {
  return (
    text
      .normalize('NFKC')
      // ぁ（U+3041）〜ゖ（U+3096）を、同じ並びのカタカナ（U+30A1〜U+30F6）にする。ゝゞ（踊り字）も同じ差でヽヾにする
      .replace(/[ぁ-ゖゝゞ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
      .toLowerCase()
  );
}

/** text に検索語 query が含まれるか（書き方の違いをそろえて比べる）。query が空なら true */
export function matchesSearch(text: string, query: string): boolean {
  const q = normalizeForSearch(query.trim());
  return q === '' || normalizeForSearch(text).includes(q);
}
