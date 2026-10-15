import { createApp } from '../src/app';
import { connectPglite } from '../src/db/client';

/** メモリ上の PGlite にマイグレーションを流した DB と、それを使う API を作る */
export async function setupTestApp() {
  const handle = await connectPglite();
  const app = createApp({ db: handle.db });
  return { app, db: handle.db, close: handle.close };
}

export type TestContext = Awaited<ReturnType<typeof setupTestApp>>;
