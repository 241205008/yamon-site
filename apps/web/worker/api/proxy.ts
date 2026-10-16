// /api/* を Cloud Run の API へ転送する（D14・D15・D44）。画面と API を同じオリジンにして、ログインの Cookie を
// ファーストパーティのまま扱う。CI のデプロイは node_modules なしで束ねるため、npm のパッケージは import しない

/** API（apps/api/src/app.ts の PROXY_SECRET_HEADER）が確かめるヘッダー。名前は API 側と同じにする */
export const PROXY_SECRET_HEADER = 'x-yamon-proxy-secret';

/**
 * 転送先と秘密の値。本番の Worker にだけ Secret として登録する（README の「デプロイ」）。
 * PR のプレビュー（wrangler preview）は本番の Secret を引き継がないので、どちらもなく、API にはつながらない（D44）
 */
export interface ApiProxyConfig {
  /** Cloud Run のサービスの URL（例 https://yamon-api-xxxx.asia-southeast1.run.app） */
  origin?: string;
  /** API の環境変数 PROXY_SECRET と同じ値 */
  secret?: string;
}

function unavailable() {
  return Response.json(
    {
      error: {
        code: 'api_unavailable',
        message: 'この環境ではサーバーにつながりません（PR のプレビューでは、本番のデータを使わないため）',
      },
    },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function proxyApi(request: Request, config: ApiProxyConfig): Promise<Response> {
  const origin = config.origin?.trim();
  const secret = config.secret?.trim();
  if (!origin || !secret) return unavailable();

  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, origin);
  const headers = new Headers(request.headers);
  // 転送先のホスト名は fetch が URL から付ける。ブラウザから届いた同じ名前のヘッダーは、必ず上書きする
  headers.delete('host');
  headers.set(PROXY_SECRET_HEADER, secret);
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  return fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    // API のリダイレクトはそのままブラウザに返す（Worker の中で追いかけない）
    redirect: 'manual',
  });
}
