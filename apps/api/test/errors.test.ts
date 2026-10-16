import type { ApiErrorBody } from '@yamon/shared';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';
import { handleError } from '../src/errors';

const app = new Hono()
  .get('/401', () => {
    throw new HTTPException(401, { message: 'ログインしてください' });
  })
  .get('/418', () => {
    throw new HTTPException(418, { message: 'teapot' });
  })
  .get('/boom', () => {
    throw new Error('SQL の中身など');
  })
  .onError(handleError);

const errorOf = async (path: string) => {
  const res = await app.request(path);
  return { status: res.status, body: (await res.json()) as ApiErrorBody };
};

describe('handleError', () => {
  it('HTTPException は status ごとのコードで返す', async () => {
    expect(await errorOf('/401')).toEqual({
      status: 401,
      body: { error: { code: 'unauthorized', message: 'ログインしてください' } },
    });
    expect((await errorOf('/418')).body.error.code).toBe('http_error');
  });

  it('想定外のエラーは中身を返さず 500', async () => {
    const original = console.error;
    console.error = () => {};
    try {
      expect(await errorOf('/boom')).toEqual({
        status: 500,
        body: { error: { code: 'internal_error', message: 'サーバーでエラーが発生しました' } },
      });
    } finally {
      console.error = original;
    }
  });
});
