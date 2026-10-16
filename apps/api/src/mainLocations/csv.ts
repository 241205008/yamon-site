import { mainLocationInputSchema } from '@yamon/shared';

export interface ParsedLocation {
  name: string;
  lat: number;
  lng: number;
}

export interface CsvResult {
  locations: ParsedLocation[];
  /** 読めなかった行（行番号は1から） */
  errors: { line: number; message: string }[];
}

/** 1行を項目に分ける。ダブルクォートで囲んだ項目（中のカンマ・"" を含む）にも対応する */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

const isNumber = (v: string) => v !== '' && Number.isFinite(Number(v));

/**
 * 主な場所の一覧（CSV：名前,緯度,経度）を読む。最初の行が見出し（数値でない緯度）なら飛ばす。
 * 各行は API と同じ入力チェック（4県の範囲内など）を通す
 */
export function parseLocationsCsv(text: string): CsvResult {
  const result: CsvResult = { locations: [], errors: [] };
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  let first = true;
  lines.forEach((raw, index) => {
    const line = index + 1;
    if (!raw.trim() || raw.trim().startsWith('#')) return;
    const [name = '', lat = '', lng = '', ...rest] = splitCsvLine(raw);
    // 空行・# の行を除いた最初の行は、緯度が数値でなければ見出しとして飛ばす
    const isHeader = first && !isNumber(lat);
    first = false;
    if (isHeader) return;
    if (rest.some((f) => f !== '')) {
      result.errors.push({ line, message: '項目が多すぎます（名前,緯度,経度 の3つにしてください）' });
      return;
    }
    if (!isNumber(lat) || !isNumber(lng)) {
      result.errors.push({ line, message: '緯度・経度は数値（例 35.1205）で書いてください' });
      return;
    }
    const parsed = mainLocationInputSchema.safeParse({ name, lat: Number(lat), lng: Number(lng) });
    if (!parsed.success) {
      result.errors.push({ line, message: parsed.error.issues.map((i) => i.message).join('、') });
      return;
    }
    if (result.locations.some((l) => l.name === parsed.data.name)) {
      result.errors.push({ line, message: `「${parsed.data.name}」が一覧の中で重複しています` });
      return;
    }
    result.locations.push({ name: parsed.data.name, lat: parsed.data.lat, lng: parsed.data.lng });
  });
  return result;
}
