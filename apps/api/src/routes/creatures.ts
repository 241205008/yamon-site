import { can, creatureInputSchema, creaturePatchSchema, type CreaturePatch, type CreatureView, type SessionUser } from '@yamon/shared';
import { and, asc, count, eq, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requirePermission, type AuthedEnv } from '../auth/middleware';
import { schema, type Db } from '../db/client';
import { nameKey } from '../db/schema';
import { isForeignKeyViolation, isUniqueViolation, notFound } from '../observations/view';
import { validate } from '../validator';

const { creatures, observationRecords: r } = schema;

/** 生き物の一覧（記録の件数つき）。生き物の数は数百程度なので、ページングせずにすべて返す */
async function listCreatures(db: Db, id?: string): Promise<CreatureView[]> {
  return db
    .select({
      id: creatures.id,
      name: creatures.name,
      category: creatures.category,
      memo: creatures.memo,
      locationProtected: creatures.locationProtected,
      recordCount: count(r.id),
    })
    .from(creatures)
    .leftJoin(r, eq(r.creatureId, creatures.id))
    .where(id ? eq(creatures.id, id) : undefined)
    .groupBy(creatures.id)
    .orderBy(asc(creatures.name));
}

/**
 * 同じ名前の生き物を2つ作らない（#105、D58）。ひらがな・カタカナ・全角半角・英字の大文字小文字の違いは同じ名前とみなす
 * （nameKey。DB の一意の索引と同じ式）。前後の空白は入力チェックで除いてある
 */
async function findSameName(db: Db, name: string, exceptId?: string) {
  const [dup] = await db
    .select({ name: creatures.name })
    .from(creatures)
    .where(
      and(
        eq(nameKey(creatures.name), nameKey(sql`${name}::text`)),
        exceptId ? ne(creatures.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  return dup?.name;
}

/** 登録済みの名前を出す（「あきあかね」と入れても、「アキアカネ」がある、と分かるように） */
function duplicateName(existing: string) {
  return new HTTPException(409, { message: `「${existing}」がすでに登録されています` });
}

async function assertNameAvailable(db: Db, name: string, exceptId?: string) {
  const existing = await findSameName(db, name, exceptId);
  if (existing !== undefined) throw duplicateName(existing);
}

/**
 * 確かめた後に、ほかの人が同じ名前を登録していた（一意の索引で止まる）ときも 409 にする。
 * 登録済みの名前を探し直して出す
 */
export async function rethrowIfDuplicate(db: Db, err: unknown, name: string | undefined, exceptId?: string): Promise<never> {
  if (name !== undefined && isUniqueViolation(err)) {
    throw duplicateName((await findSameName(db, name, exceptId)) ?? name);
  }
  throw err;
}

/** 「位置を保護する」印を変えられるのは creatures.protect の権限がある人（管理者・幹部）だけ（MVP 2章） */
function assertCanProtect(user: SessionUser, from: boolean, to: boolean | undefined) {
  if (to !== undefined && to !== from && !can(user.role, 'creatures.protect')) {
    throw new HTTPException(403, { message: '「位置を保護する」印を付け外しできるのは、管理者と幹部だけです' });
  }
}

/**
 * 生き物を更新する（PUT・PATCH で共通）。送られた項目だけを変える。
 * 印を変えるには creatures.protect が要り、名前を変えるときは重複を確かめる
 */
async function updateCreature(db: Db, user: SessionUser, id: string, input: CreaturePatch) {
  const [current] = await db
    .select({ locationProtected: creatures.locationProtected })
    .from(creatures)
    .where(eq(creatures.id, id))
    .limit(1);
  if (!current) throw notFound('生き物');
  assertCanProtect(user, current.locationProtected, input.locationProtected);
  if (input.name !== undefined) await assertNameAvailable(db, input.name, id);
  const updated = await db
    .update(creatures)
    .set(input)
    .where(eq(creatures.id, id))
    .returning({ id: creatures.id })
    .catch((err: unknown) => rethrowIfDuplicate(db, err, input.name, id));
  if (updated.length === 0) throw notFound('生き物');
  return readCreature(db, id);
}

async function readCreature(db: Db, id: string) {
  const [creature] = await listCreatures(db, id);
  if (!creature) throw notFound('生き物');
  return creature;
}

export const creatureRoutes = new Hono<AuthedEnv>()
  .get('/', requirePermission('records.view'), async (c) => {
    return c.json({ creatures: await listCreatures(c.get('db')) });
  })
  .post('/', requirePermission('creatures.manage'), validate('json', creatureInputSchema), async (c) => {
    const db = c.get('db');
    const input = c.req.valid('json');
    assertCanProtect(c.get('user'), false, input.locationProtected);
    await assertNameAvailable(db, input.name);
    const [created] = await db
      .insert(creatures)
      .values({ ...input, createdBy: c.get('user').id })
      .returning({ id: creatures.id })
      .catch((err: unknown) => rethrowIfDuplicate(db, err, input.name));
    return c.json(await readCreature(db, created.id), 201);
  })
  /** 記録は creatureId で参照しているので、名前を直すと過去の記録の表示にも反映される */
  .put('/:id{[0-9a-f-]{36}}', requirePermission('creatures.manage'), validate('json', creatureInputSchema), async (c) => {
    return c.json(await updateCreature(c.get('db'), c.get('user'), c.req.param('id'), c.req.valid('json')));
  })
  /**
   * 送った項目だけを変える（#99、D56）。生き物管理の2つの編集画面（名前・カテゴリ／メモ）が使う。
   * 送らなかった項目は今のままなので、ほかの人が同時に別の項目を変えても、古い値で上書きしない。
   * 権限と名前の重複の確認は PUT と同じ
   */
  .patch('/:id{[0-9a-f-]{36}}', requirePermission('creatures.manage'), validate('json', creaturePatchSchema), async (c) => {
    return c.json(await updateCreature(c.get('db'), c.get('user'), c.req.param('id'), c.req.valid('json')));
  })
  /** 記録がある生き物は削除できない（D9。DB の外部キーでも止まる） */
  .delete('/:id{[0-9a-f-]{36}}', requirePermission('creatures.manage'), async (c) => {
    const db = c.get('db');
    const creature = await readCreature(db, c.req.param('id'));
    if (creature.recordCount > 0) {
      throw new HTTPException(409, {
        message: `この生き物には${creature.recordCount}件の観察記録があるため削除できません`,
      });
    }
    try {
      await db.delete(creatures).where(eq(creatures.id, creature.id));
    } catch (err) {
      // 確かめた後に、別の人が記録を足していた（外部キーで止まる）
      if (isForeignKeyViolation(err)) {
        throw new HTTPException(409, { message: 'この生き物には観察記録があるため削除できません' });
      }
      throw err;
    }
    return c.body(null, 204);
  });
