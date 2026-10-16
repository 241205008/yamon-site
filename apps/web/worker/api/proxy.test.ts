import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../index';
import { PROXY_SECRET_HEADER } from './proxy';

const ORIGIN = 'https://yamon-api-test.asia-southeast1.run.app';
const SECRET = 'worker-proxy-secret-0123456789abcdef';

/**
 * 転送先への fetch を記録し、決まった応答を返す。
 * Node.js の Request は本文がストリームのとき duplex を求める（Workers では要らない）ので、記録するときだけ足す
 */
function stubFetch(response = new Response('{"ok":true}', { status: 200 })) {
  const calls: Request[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(new Request(input, { ...init, duplex: 'half' } as RequestInit));
      return response;
    }),
  );
  return calls;
}

function env(overrides: Partial<Env> = {}): Env {
  return {
    ASSETS: { fetch: vi.fn(async () => new Response('asset')) },
    API_ORIGIN: ORIGIN,
    PROXY_SECRET: SECRET,
    ...overrides,
  } as unknown as Env;
}

const call = (e: Env, path: string, init?: RequestInit) =>
  worker.fetch(new Request(`https://yamon-site.example.workers.dev${path}`, init) as Request<unknown, IncomingRequestCfProperties>, e);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/api/* の転送（D44）', () => {
  it('パスとクエリをそのまま Cloud Run へ送り、秘密のヘッダーを付ける', async () => {
    const calls = stubFetch();
    const res = await call(env(), '/api/records?cursor=abc&limit=20', { headers: { cookie: 'yamon_session=s1' } });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${ORIGIN}/api/records?cursor=abc&limit=20`);
    expect(calls[0].headers.get(PROXY_SECRET_HEADER)).toBe(SECRET);
    expect(calls[0].headers.get('cookie')).toBe('yamon_session=s1');
  });

  it('ブラウザが送ってきた秘密のヘッダーは、本当の値で上書きする', async () => {
    const calls = stubFetch();
    await call(env(), '/api/health', { headers: { [PROXY_SECRET_HEADER]: 'guess' } });
    expect(calls[0].headers.get(PROXY_SECRET_HEADER)).toBe(SECRET);
  });

  it('POST の本文と Content-Type を渡し、API の応答（Set-Cookie を含む）をそのまま返す', async () => {
    const calls = stubFetch(
      new Response('{"user":{}}', { status: 200, headers: { 'set-cookie': 'yamon_session=new; HttpOnly' } }),
    );
    const res = await call(env(), '/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@example.com', password: 'x' }),
    });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].headers.get('content-type')).toBe('application/json');
    expect(await calls[0].json()).toEqual({ email: 'a@example.com', password: 'x' });
    expect(res.headers.get('set-cookie')).toBe('yamon_session=new; HttpOnly');
  });

  it('API のリダイレクトを Worker の中で追いかけない', async () => {
    const calls = stubFetch(new Response(null, { status: 302, headers: { location: '/' } }));
    const res = await call(env(), '/api/somewhere');
    expect(calls[0].redirect).toBe('manual');
    expect(res.status).toBe(302);
  });

  it('転送先か秘密の値がない（PR のプレビュー）なら、API につながず 503 を返す', async () => {
    for (const overrides of [{ API_ORIGIN: undefined }, { PROXY_SECRET: undefined }, { PROXY_SECRET: ' ' }]) {
      const calls = stubFetch();
      const res = await call(env(overrides), '/api/auth/me');
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ error: { code: 'api_unavailable' } });
      expect(calls).toHaveLength(0);
    }
  });

  it('/api 以外のパスは転送しない', async () => {
    const calls = stubFetch();
    const res = await call(env(), '/apiary');
    expect(await res.text()).toBe('asset');
    expect(calls).toHaveLength(0);
  });
});
