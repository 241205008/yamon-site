import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROXY_SECRET_HEADER } from '../src/app';
import { requirePermission } from '../src/auth/middleware';
import { createUser, jsonHeaders, login, setupTestApp, type TestContext } from './helpers';

/**
 * ワイルドカードのミドルウェア（`.use(requirePermission(...))`、`app.use(...)`）が、どのルートでも飛ばされないこと（D60）。
 *
 * hono 4.13.15 までの RegExpRouter（既定の SmartRouter が選ぶ）は、改行の文字を % で書いたパス（%0A など）のとき、
 * ワイルドカードのミドルウェアを1つも通さずに notFound へ進んでいた（GHSA-h7mg-cq63-vhpq の3）。
 * ルートの組み方によっては、ハンドラーまでミドルウェアなしで届いた（同じ advisory の1・2）。
 * hono を上げても、ルートを足しても、権限の確認が効き続けることを、登録されたルートを全部たどって確かめる
 */

const SECRET = 'test-proxy-secret-0123456789abcdef';
const UUID = '00000000-0000-4000-8000-000000000000';
/** advisory に書かれた、ワイルドカードが合わなかった改行の文字 */
const LINE_TERMINATORS = ['%0A', '%0D', '%E2%80%A8', '%E2%80%A9'];

/** ルートのパターン（/api/admin/users/:id/role など）を、実際に送れるパスにする */
const toPath = (pattern: string) => pattern.replace(/:[a-zA-Z]+(\{[^}]*\})?/g, UUID);

/** ワイルドカードのミドルウェアで守っているところ（routes/admin.ts・mapData/routes.ts・routes/account.ts） */
const GUARDED = ['/api/admin', '/api/account'];

let ctx: TestContext;
let memberCookie: string;
beforeAll(async () => {
  ctx = await setupTestApp({ mapData: { authorize: requirePermission('mapData.update') } });
  const member = await createUser(ctx.db, { role: 'member' });
  memberCookie = await login(ctx, member.email, member.password);
});
afterAll(() => ctx.close());

/** ハンドラーのあるルート（メソッドが ALL のものはミドルウェア）のうち、prefix で始まるもの */
function routesUnder(prefix: string) {
  const routes = ctx.app.routes
    .filter((r) => r.method !== 'ALL' && (r.path === prefix || r.path.startsWith(`${prefix}/`)))
    .map((r) => ({ method: r.method, path: toPath(r.path) }));
  // 同じメソッド・パスに、ルートごとのミドルウェアとハンドラーが別々に並ぶので、まとめる
  return [...new Map(routes.map((r) => [`${r.method} ${r.path}`, r])).values()];
}

const send = (method: string, path: string, cookie?: string) =>
  ctx.app.request(path, {
    method,
    headers: { ...jsonHeaders, ...(cookie ? { cookie } : {}) },
    body: method === 'GET' ? undefined : '{}',
  });

describe.each(GUARDED)('%s のルートは、ワイルドカードのミドルウェアを必ず通る', (prefix) => {
  it('ルートが見つかる（たどる対象が空でテストが素通りしない）', () => {
    expect(routesUnder(prefix).length).toBeGreaterThan(0);
  });

  it('未ログインは、どのルートも 401', async () => {
    for (const { method, path } of routesUnder(prefix)) {
      expect({ method, path, status: (await send(method, path)).status }).toEqual({ method, path, status: 401 });
    }
  });

  it('改行の文字を % で書いたパスでも、未ログインは 401（404 で素通りしない）', async () => {
    for (const { method, path } of routesUnder(prefix)) {
      for (const lt of LINE_TERMINATORS) {
        for (const p of [`${path}${lt}`, `${path}/${lt}`]) {
          expect({ method, p, status: (await send(method, p)).status }).toEqual({ method, p, status: 401 });
        }
      }
    }
  });
});

describe('/api/admin のルートは、管理者でなければ 403', () => {
  it('部員は、どのルートも 403', async () => {
    for (const { method, path } of routesUnder('/api/admin')) {
      const status = (await send(method, path, memberCookie)).status;
      expect({ method, path, status }).toEqual({ method, path, status: 403 });
    }
  });
});

describe('CSRF の確認（D33）も、改行の文字のパスで飛ばされない', () => {
  it.each(LINE_TERMINATORS)('JSON でない POST /api/auth/login%s は 415', async (lt) => {
    const res = await ctx.app.request(`/api/auth/login${lt}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    });
    expect(res.status).toBe(415);
  });
});

describe('入口の秘密のヘッダー（D44）も、どのパスでも確かめる', () => {
  let guarded: TestContext;
  beforeAll(async () => {
    guarded = await setupTestApp({ proxySecret: SECRET });
  });
  afterAll(() => guarded.close());

  it.each(
    ['/api/health', '/api/admin/users', '/api/no-such-path'].flatMap((p) => ['', ...LINE_TERMINATORS].map((lt) => p + lt)),
  )('ヘッダーなしの %s は 403', async (path) => {
    const res = await guarded.app.request(path);
    expect(res.status).toBe(403);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('ヘッダーがあれば、知らないパスは 404（秘密を確かめた後に notFound へ進む）', async () => {
    const res = await guarded.app.request(`/api/health${LINE_TERMINATORS[0]}`, { headers: { [PROXY_SECRET_HEADER]: SECRET } });
    expect(res.status).toBe(404);
  });
});
