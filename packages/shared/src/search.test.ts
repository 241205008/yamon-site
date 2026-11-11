import { describe, expect, it } from 'vitest';
import { matchesSearch, normalizeForSearch } from './search';

describe('normalizeForSearch（#91）', () => {
  it('ひらがなをカタカナにそろえる', () => {
    expect(normalizeForSearch('あきあかね')).toBe('アキアカネ');
    expect(normalizeForSearch('ぁゔゕゖ')).toBe('ァヴヵヶ');
  });

  it('半角カナと全角英数字をそろえ、英字は小文字にする', () => {
    expect(normalizeForSearch('ｱｷｱｶﾈ')).toBe('アキアカネ');
    expect(normalizeForSearch('ｶﾞ')).toBe('ガ');
    expect(normalizeForSearch('ＡＢＣ１２')).toBe('abc12');
  });

  it('漢字と長音・カタカナはそのまま', () => {
    expect(normalizeForSearch('蛍ホタルー')).toBe('蛍ホタルー');
  });
});

describe('matchesSearch（#91）', () => {
  it('ひらがなの検索語でカタカナの名前が見つかる', () => {
    expect(matchesSearch('アキアカネ', 'あきあかね')).toBe(true);
    expect(matchesSearch('アキアカネ', 'あか')).toBe(true);
    expect(matchesSearch('アメリカザリガニ', 'ざりがに')).toBe(true);
  });

  it('カタカナ・半角カナ・前後の空白でも見つかる', () => {
    expect(matchesSearch('アキアカネ', 'アキアカネ')).toBe(true);
    expect(matchesSearch('アキアカネ', ' ｱｷｱｶﾈ ')).toBe(true);
  });

  it('一致しないものは見つからない', () => {
    expect(matchesSearch('アキアカネ', 'おにやんま')).toBe(false);
    expect(matchesSearch('蛍', 'ほたる')).toBe(false);
  });

  it('検索語が空なら、すべて一致として扱う', () => {
    expect(matchesSearch('アキアカネ', '')).toBe(true);
    expect(matchesSearch('アキアカネ', '  ')).toBe(true);
  });
});
