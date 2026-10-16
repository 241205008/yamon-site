import { describe, expect, it } from 'vitest';
import { parseLocationsCsv } from '../src/mainLocations/csv';

describe('主な場所の CSV', () => {
  it('見出し行・空行・# の行を飛ばし、名前,緯度,経度 を読む', () => {
    const csv = '﻿名前,緯度,経度\r\n# メモ\r\n天白川の河原,35.12,136.97\r\n\r\n"相生山緑地, 北側",35.11,136.98\r\n';
    expect(parseLocationsCsv(csv)).toEqual({
      locations: [
        { name: '天白川の河原', lat: 35.12, lng: 136.97 },
        { name: '相生山緑地, 北側', lat: 35.11, lng: 136.98 },
      ],
      errors: [],
    });
  });

  it('4県の範囲外・数値でない座標・重複・項目の多すぎを行番号つきで返す', () => {
    const csv = ['東京駅,35.68,139.76', '池,abc,136.9', '池2,35.1,136.9', '池2,35.1,136.9', '森,35.1,136.9,余分'].join('\n');
    const { locations, errors } = parseLocationsCsv(csv);
    expect(locations.map((l) => l.name)).toEqual(['池2']);
    expect(errors.map((e) => e.line)).toEqual([1, 2, 4, 5]);
  });
});
