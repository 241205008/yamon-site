import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@yamon/shared';
import { KeyRound, Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AuthCard } from '../components/AuthCard';
import { ErrorText, inputClass } from '../components/ui';
import { ApiError } from '../lib/api';
import { confirmPasswordReset, requestPasswordReset } from '../lib/auth';

const toMessage = (e: unknown) => (e instanceof ApiError ? e.message : '処理に失敗しました');

const backToLogin = (
  <p className="mt-6 text-center text-sm text-gray-600">
    <Link to="/login" className="text-green-600 hover:text-green-700">
      ログインへ戻る
    </Link>
  </p>
);

/** /forgot-password：メールアドレスを入れて、再設定のメールを送ってもらう（#5） */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // 登録されていてもいなくても同じ案内が返る（登録の有無は画面からは分からない）
      setSent(await requestPasswordReset(email));
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard icon={Mail} subtitle="パスワードの再設定">
      {sent ? (
        <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          {sent}
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-6">
          <p className="text-sm text-gray-600">
            登録しているメールアドレスを入力してください。パスワードを再設定するためのリンクをメールで送ります。
          </p>
          <div>
            <label htmlFor="reset-email" className="mb-2 block text-sm text-gray-700">メールアドレス</label>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              className={inputClass}
            />
          </div>
          <ErrorText message={error} />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-green-600 py-3 text-white transition-colors hover:bg-green-700 disabled:opacity-60"
          >
            {busy ? '送信中…' : '再設定のメールを送る'}
          </button>
        </form>
      )}
      {backToLogin}
    </AuthCard>
  );
}

/** /reset-password?token=...：メールのリンクから開き、新しいパスワードを決める（#5） */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('確認用パスワードが一致しません');
      return;
    }
    setBusy(true);
    try {
      setDone(await confirmPasswordReset({ token, password }));
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard icon={KeyRound} subtitle="新しいパスワードの設定">
      {done ? (
        <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          {done}
        </p>
      ) : !token ? (
        <p className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          再設定のリンクが正しくありません。メールのリンクをそのまま開くか、もう一度
          <Link to="/forgot-password" className="mx-1 text-green-700 underline">
            再設定のメールを送って
          </Link>
          ください。
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-6">
          <div>
            <label htmlFor="reset-password" className="mb-2 block text-sm text-gray-700">
              新しいパスワード（{MIN_PASSWORD_LENGTH}文字以上）
            </label>
            <input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="reset-confirm" className="mb-2 block text-sm text-gray-700">新しいパスワード（確認）</label>
            <input
              id="reset-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
            />
          </div>
          <ErrorText message={error} />
          {error && (
            <p className="text-sm text-gray-600">
              リンクが使えないときは、もう一度
              <Link to="/forgot-password" className="mx-1 text-green-700 underline">
                再設定のメールを送って
              </Link>
              ください。
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-green-600 py-3 text-white transition-colors hover:bg-green-700 disabled:opacity-60"
          >
            {busy ? '設定中…' : 'パスワードを変更する'}
          </button>
        </form>
      )}
      {backToLogin}
    </AuthCard>
  );
}
