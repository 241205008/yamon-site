import { creatureInputSchema, type CreatureView } from '@yamon/shared';
import { and, asc, count, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requirePermission, type AuthedEnv } from '../auth/middleware';
import { schema, type Db } from '../db/client';
import { isForeignKeyViolation, notFound } from '../observations/view';
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

/** 同じ名前の生き物を2つ作らない（前後の空白は入力チェックで除いてある） */
async function assertNameAvailable(db: Db, name: string, exceptId?: string) {
  const [dup] = await db
    .select({ id: creatures.id })
    .from(creatures)
    .where(and(eq(creatures.name, name), exceptId ? ne(creatures.id, exceptId) : undefined))
    .limit(1);
  if (dup) throw new HTTPException(409, { message: `「${name}」はすでに登録されています` });
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
    await assertNameAvailable(db, input.name);
    const [created] = await db
      .insert(creatures)
      .values({ ...input, createdBy: c.get('user').id })
      .returning({ id: creatures.id });
    return c.json(await readCreature(db, created.id), 201);
  })
  /** 記録は creatureId で参照しているので、名前を直すと過去の記録の表示にも反映される */
  .put('/:id{[0-9a-f-]{36}}', requirePermission('creatures.manage'), validate('json', creatureInputSchema), async (c) => {
    const db = c.get('db');
    const id = c.req.param('id');
    const input = c.req.valid('json');
    await assertNameAvailable(db, input.name, id);
    const updated = await db.update(creatures).set(input).where(eq(creatures.id, id)).returning({ id: creatures.id });
    if (updated.length === 0) throw notFound('生き物');
    return c.json(await readCreature(db, id));
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
