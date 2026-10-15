import { defineConfig } from 'drizzle-kit';

// `npm run db:generate -w @yamon/api` で src/db/schema.ts の変更から drizzle/ にマイグレーションを作る。
// generate は DB に接続しないので、DATABASE_URL は不要
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  strict: true,
});
