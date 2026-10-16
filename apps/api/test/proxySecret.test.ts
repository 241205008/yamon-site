import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROXY_SECRET_HEADER } from '../src/app';
import { setupTestApp, type TestContext } from './helpers';

const SECRET = 'test-proxy-secret-0123456789abcdef';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await setupTestApp({ proxySecret: SECRET });
});
afterAll(() => ctx.close());

describe('入口を Worker 経由に限る（PROXY_SECRET、D44）', () => {
  it('秘密のヘッダーがなければ 403（ヘルスチェックも）', async () => {
    const res = await ctx.app.request('/api/health');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: 'forbidden', message: '直接のアクセスは受け付けていません' } });
  });

  it('値が違えば 403', async () => {
    const res = await ctx.app.request('/api/health', { headers: { [PROXY_SECRET_HEADER]: `${SECRET}x` } });
    expect(res.status).toBe(403);
  });

  it('値が同じなら通す', async () => {
    const res = await ctx.app.request('/api/health', { headers: { [PROXY_SECRET_HEADER]: SECRET } });
    expect(res.status).toBe(200);
  });

  it('断ったときも、セキュリティ用のヘッダーは付く', async () => {
    const res = await ctx.app.request('/api/auth/me');
    expect(res.status).toBe(403);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('PROXY_SECRET を渡さないとき（開発・テスト）', () => {
  it('ヘッダーなしでも通す', async () => {
    const plain = await setupTestApp();
    try {
      expect((await plain.app.request('/api/health')).status).toBe(200);
    } finally {
      await plain.close();
    }
  });
});
