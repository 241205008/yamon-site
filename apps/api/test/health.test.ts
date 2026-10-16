import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestApp, type TestContext } from './helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(() => ctx.close());

describe('GET /api/health', () => {
  it('200 と status: ok を返す', async () => {
    const res = await ctx.app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('セキュリティ用のヘッダーが付く', async () => {
    const res = await ctx.app.request('/api/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('存在しないパス', () => {
  it('404 と JSON のエラーを返す', async () => {
    const res = await ctx.app.request('/api/nothing');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: '見つかりません' } });
  });
});
