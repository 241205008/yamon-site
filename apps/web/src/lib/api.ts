import type { ApiErrorBody } from '@yamon/shared';

/** API がエラーを返したとき（または通信できなかったとき）の例外。message は画面にそのまま出せる */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;

/** ログインが切れた（401）ときに呼ぶ処理を登録する（auth.ts がログイン状態を消す） */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

/**
 * 同じオリジンの API（/api/...）を呼ぶ。Cookie のセッションが自動で付く。
 * 状態を変えるリクエストは必ず JSON で送る（API の CSRF 対策、D33）
 */
export async function apiFetch<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: hasBody ? { 'content-type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(options.body ?? {}) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network_error', 'サーバーに接続できません。通信環境を確かめてから、もう一度お試しください');
  }

  if (res.ok) {
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  const code = body?.error.code ?? 'http_error';
  // 入力チェックの誤りは、最初の項目の理由を出す
  const message =
    body?.error.issues?.[0]?.message ?? body?.error.message ?? `サーバーでエラーが発生しました（${res.status}）`;
  if (res.status === 401 && code === 'unauthorized') onUnauthorized?.();
  throw new ApiError(res.status, code, message);
}
