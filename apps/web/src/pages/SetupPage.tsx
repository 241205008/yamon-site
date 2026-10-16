import { MAX_NAME_LENGTH, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, type SetupStatus } from '@yamon/shared';
import { ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { ErrorText, inputClass } from '../components/ui';
import { ApiError } from '../lib/api';
import { fetchSetupStatus, setupFirstAdmin, useCurrentUser } from '../lib/auth';

const toMessage = (e: unknown) => (e instanceof ApiError ? e.message : '処理に失敗しました');

/**
 * 初回セットアップ（#4）。ユーザーが1人もいないときだけ表示し、最初の管理者を登録する。
 * セットアップ用トークン（サーバーの環境変数 SETUP_TOKEN）を知っている人だけが登録できる
 */
export function SetupPage() {
  const user = useCurrentUser();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchSetupStatus()
      .then(setStatus)
      .catch((e) => setLoadError(toMessage(e)));
  }, []);

  // 登録に成功するとログインした状態になり、ここで管理者画面へ移る（続けて招待できる）
  if (user) return <Navigate to="/admin" replace />;
  if (status?.needed === false) return <Navigate to="/login" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('確認用パスワードが一致しません');
      return;
    }
    setBusy(true);
    try {
      await setupFirstAdmin({ token, name, email, password });
    } catch (err) {
      setError(toMessage(err));
      // 入力中に別の人がセットアップを済ませたときは、ログイン画面へ
      if (err instanceof ApiError && err.code === 'setup_done') setStatus({ needed: false, available: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-600">
            <ShieldCheck className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">やもんサイト</h1>
          <p className="mt-2 text-gray-600">初回セットアップ</p>
        </div>

        {loadError ? (
          <ErrorText message={loadError} />
        ) : status === null ? (
          <p className="py-6 text-center text-sm text-gray-500">確認しています…</p>
        ) : !status.available ? (
          <p className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            サーバーにセットアップ用トークン（SETUP_TOKEN）が設定されていないため、まだ登録できません。サイトを用意した人（デプロイした人）に確認してください。
          </p>
        ) : (
          <>
            <p className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              最初の管理者を登録します。セットアップ用トークンは、サイトを用意した人（デプロイした人）が知っています。
            </p>
            <form onSubmit={submit} className="space-y-6">
              <div>
                <label htmlFor="setup-token" className="mb-2 block text-sm text-gray-700">セットアップ用トークン</label>
                <input
                  id="setup-token"
                  type="password"
                  autoComplete="off"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className={`${inputClass} font-mono text-sm`}
                />
              </div>
              <div>
                <label htmlFor="setup-name" className="mb-2 block text-sm text-gray-700">名前</label>
                <input
                  id="setup-name"
                  required
                  maxLength={MAX_NAME_LENGTH}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="setup-email" className="mb-2 block text-sm text-gray-700">メールアドレス</label>
                <input
                  id="setup-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="setup-password" className="mb-2 block text-sm text-gray-700">
                  パスワード（{MIN_PASSWORD_LENGTH}文字以上）
                </label>
                <input
                  id="setup-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  maxLength={MAX_PASSWORD_LENGTH}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="setup-confirm" className="mb-2 block text-sm text-gray-700">パスワード（確認）</label>
                <input
                  id="setup-confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={inputClass}
                />
              </div>
              <ErrorText message={error} />
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-green-600 py-3 text-white transition-colors hover:bg-green-700 disabled:opacity-60"
              >
                {busy ? '登録中…' : '管理者として登録する'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
