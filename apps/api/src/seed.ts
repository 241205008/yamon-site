/**
 * 開発用のアカウントを入れる：`npm run db:seed -w @yamon/api`（API サーバーを止めてから実行する。PGlite は同時に1つしか開けない）
 * ユーザーが1人もいないときだけ、役割ごとに1人ずつ作る。ローカルの PGlite 専用で、DATABASE_URL があるときは動かさない。
 * 本番の最初の管理者は、初回セットアップ（#4）で作る
 */
import type { Role } from '@yamon/shared';
import { count } from 'drizzle-orm';
import { hashPassword } from './auth/password';
import { connectPglite, schema } from './db/client';

// 本番の DB に、パスワードが知られたアカウントを作らない。PGlite（ローカル）にだけ入れる
if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL) {
  console.error('開発用のアカウントは、ローカルの PGlite にだけ作ります（NODE_ENV=production や DATABASE_URL があるときは作りません）');
  process.exit(1);
}

/** README の「開発用のアカウント」と同じ。パスワードはすべて password123 */
export const DEV_ACCOUNTS: { email: string; name: string; role: Role }[] = [
  { email: 'admin@example.com', name: '管理者', role: 'admin' },
  { email: 'officer@example.com', name: '幹部', role: 'officer' },
  { email: 'member@example.com', name: '部員', role: 'member' },
  { email: 'obog@example.com', name: 'OB・OG', role: 'viewer' },
];
const DEV_PASSWORD = 'password123';

const handle = await connectPglite(process.env.PGLITE_DIR ?? '.data/pglite');

try {
  const [{ users }] = await handle.db.select({ users: count() }).from(schema.users);
  if (users > 0) {
    console.log(`ユーザーが既に${users}人いるため、何もしません`);
  } else {
    const passwordHash = await hashPassword(DEV_PASSWORD);
    await handle.db.insert(schema.users).values(DEV_ACCOUNTS.map((a) => ({ ...a, passwordHash })));
    console.log(`開発用のアカウントを作りました（パスワードはすべて ${DEV_PASSWORD}）`);
    for (const a of DEV_ACCOUNTS) console.log(`  ${a.role.padEnd(7)} ${a.email}`);
  }
} finally {
  await handle.close();
}
