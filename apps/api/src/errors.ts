import type { ApiErrorBody } from '@yamon/shared';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export function errorBody(code: string, message: string, issues?: ApiErrorBody['error']['issues']): ApiErrorBody {
  return { error: issues ? { code, message, issues } : { code, message } };
}

/** zod の検証エラー（ZodError）のうち、ここで使う部分 */
interface ValidationIssues {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
}

export function validationErrorBody(error: ValidationIssues): ApiErrorBody {
  return errorBody(
    'validation_error',
    '入力内容に誤りがあります',
    error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
  );
}

/** HTTPException の status ごとのエラーコード。フロントは code で表示を分ける */
const HTTP_ERROR_CODES: Partial<Record<number, string>> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  429: 'too_many_requests',
};

/** 想定外のエラーは中身を返さずログにだけ出す（スタックトレースや SQL を利用者に見せない） */
export function handleError(err: Error, c: Context) {
  if (err instanceof HTTPException) {
    const status = err.status as ContentfulStatusCode;
    return c.json(errorBody(HTTP_ERROR_CODES[status] ?? 'http_error', err.message), status);
  }
  console.error(err);
  return c.json(errorBody('internal_error', 'サーバーでエラーが発生しました'), 500);
}
