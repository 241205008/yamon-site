import { type ApiErrorBody, categorySchema, optionalCoordinatesSchema, requiredText } from '@yamon/shared';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { handleError } from '../src/errors';
import { validate } from '../src/validator';

// 入力チェックの仕組みだけを確かめるための、テスト用のルート
const inputSchema = z
  .object({ name: requiredText(50), category: categorySchema })
  .and(optionalCoordinatesSchema);

const app = new Hono()
  .post('/echo', validate('json', inputSchema), (c) => c.json(c.req.valid('json')))
  .onError(handleError);

const post = (body: string) =>
  app.request('/echo', { method: 'POST', headers: { 'content-type': 'application/json' }, body });

describe('validate（zod の入力チェック）', () => {
  it('正しい入力は、整えた値（前後の空白を除いた名前）で受け取れる', async () => {
    const res = await post(JSON.stringify({ name: ' カブトムシ ', category: 'インセクター', lat: 35.17, lng: 136.88 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'カブトムシ', category: 'インセクター', lat: 35.17, lng: 136.88 });
  });

  it('誤った入力は 400 と項目ごとの理由を返す', async () => {
    const res = await post(JSON.stringify({ name: '', category: 'その他', lat: null, lng: null }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error.code).toBe('validation_error');
    expect(body.error.issues?.map((i) => i.path).sort()).toEqual(['category', 'name']);
  });

  it('東海3県の範囲外の座標は 400', async () => {
    const res = await post(JSON.stringify({ name: 'スズメ', category: 'バーダー', lat: 35.68, lng: 139.77 }));
    expect(res.status).toBe(400);
  });

  it('JSON として読めない本文は 400', async () => {
    const res = await post('{');
    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe('bad_request');
  });
});
