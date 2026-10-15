// drizzle-kit を、apps/api に入っている drizzle-orm を読む形で起動する（`npm run db:generate -w @yamon/api`）。
//
// drizzle-orm の任意の peer 依存（expo-sqlite → react-native → React 19）が apps/web の React 18 と
// 衝突するため、npm は drizzle-orm を apps/api/node_modules に置き、drizzle-kit はルートの node_modules に置く。
// そのままでは drizzle-kit から drizzle-orm が見えないので、drizzle-orm の読み込みの起点を apps/api に差し替える。
// module.registerHooks は Node.js 22.15 以降で使える（require と import の両方に効く）
import * as nodeModule from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { createRequire, registerHooks } = nodeModule;
if (typeof registerHooks !== 'function') {
  console.error(`Node.js 22.15 以降が必要です（今は ${process.version}）`);
  process.exit(1);
}

const apiUrl = new URL('../package.json', import.meta.url).href;
const requireFromApi = createRequire(apiUrl);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'drizzle-orm' || specifier.startsWith('drizzle-orm/')) {
      // require は呼び出し元のファイルから探すため、apps/api から探した結果を直接返す
      if (context.conditions?.includes('require')) {
        return { url: pathToFileURL(requireFromApi.resolve(specifier)).href, shortCircuit: true };
      }
      return nextResolve(specifier, { ...context, parentURL: apiUrl });
    }
    return nextResolve(specifier, context);
  },
});

const require = createRequire(import.meta.url);
// bin.cjs は exports に含まれないので、パッケージの場所から組み立てる
const bin = path.join(path.dirname(require.resolve('drizzle-kit')), 'bin.cjs');
process.argv.splice(1, 1, bin);
require(bin);
