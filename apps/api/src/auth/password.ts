import { randomBytes } from 'node:crypto';
import { argon2id, argon2Verify } from 'hash-wasm';

/**
 * パスワードのハッシュ（Argon2id、D18）。OWASP の推奨の最小設定（メモリ 19 MiB・2回・並列1）。
 * hash-wasm（WebAssembly）を使い、ネイティブのアドオンなしで1ファイルにまとめられるようにする（D31・D33）
 */
const PARAMS = { parallelism: 1, iterations: 2, memorySize: 19 * 1024, hashLength: 32 } as const;

/** "$argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>" の形の文字列を返す。設定もこの中に入る */
export function hashPassword(password: string): Promise<string> {
  return argon2id({ ...PARAMS, password, salt: randomBytes(16), outputType: 'encoded' });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash });
  } catch {
    // 壊れたハッシュは一致しない扱い
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * 登録されていないメールアドレスでも同じだけ時間をかける（応答時間で登録の有無を漏らさない）。
 * 比べる相手のハッシュは最初の1回だけ作る
 */
export async function verifyDummyPassword(password: string): Promise<false> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(password, await dummyHash);
  return false;
}
