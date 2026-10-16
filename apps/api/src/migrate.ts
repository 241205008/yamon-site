import { connectPostgres } from './db/client';

/** DATABASE_URL の DB に、未適用のマイグレーションを流す（`npm run db:migrate -w @yamon/api`） */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL を指定してください');
  process.exit(1);
}

const handle = await connectPostgres(url, { migrate: true });
await handle.close();
console.log('マイグレーションを適用しました');
