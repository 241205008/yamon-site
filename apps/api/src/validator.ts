import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodType } from 'zod';
import { validationErrorBody } from './errors';

/**
 * packages/shared の zod スキーマで入力をチェックするミドルウェア。
 * 失敗したら 400 と項目ごとの理由（ApiErrorBody）を返す。通った値は c.req.valid(target) で受け取る。
 *
 *   app.post('/creatures', validate('json', creatureInputSchema), (c) => { const input = c.req.valid('json'); ... })
 */
export const validate = <Target extends keyof ValidationTargets, Schema extends ZodType>(
  target: Target,
  schema: Schema,
) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) return c.json(validationErrorBody(result.error), 400);
  });
