import { MAX_PASSWORD_LENGTH, ROLE_LABELS } from '@yamon/shared';
import { useState, type FormEvent } from 'react';
import { BackBar, ErrorText, PageBackground, inputClass } from '../components/ui';
import { ApiError } from '../lib/api';
import { changeEmail, useCurrentUser } from '../lib/auth';

const toMessage = (e: unknown) => (e instanceof ApiError ? e.message : '処理に失敗しました');

/**
 * アカウントの画面（#84・D54）。ログイン用のメールアドレスを、本人が今のパスワードを入れて変える。
 * 卒業で大学のアドレスが使えなくなる人が、記録や役割を保ったまま個人のアドレスへ移すため
 */
export function AccountPage() {
  // RequireAuth の内側なので、ログインしている
  const user = useCurrentUser()!;
  const [email, setEmail] = useState('');
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(null);
    // 確認のメールは送らないので、打ち間違いは2回の入力で防ぐ（D54）
    if (email.trim().toLowerCase() !== confirm.trim().toLowerCase()) {
      setError('確認用のメールアドレスが一致しません');
      return;
    }
    setBusy(true);
    try {
      const res = await changeEmail({ email, currentPassword: password });
      setDone(
        `ログイン用のメールアドレスを ${res.user.email} に変更しました。次からはこのアドレスでログインしてください（パスワードは変わりません）。` +
          (res.mailSent ? '新しいアドレスに、変更のお知らせのメールを送りました。' : ''),
      );
      setEmail('');
      setConfirm('');
      setPassword('');
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageBackground>
      <BackBar to="/" label="ホーム画面に戻る" />
      <main className="mx-auto max-w-xl px-4 py-8">
        <h1 className="mb-6 text-3xl font-bold text-gray-900">アカウント</h1>

        <section className="mb-6 rounded-xl bg-white p-6 shadow-md">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-500">名前</dt>
            <dd className="text-gray-900">{user.name}</dd>
            <dt className="text-gray-500">役割</dt>
            <dd className="text-gray-900">{ROLE_LABELS[user.role]}</dd>
            <dt className="text-gray-500">ログイン用のメールアドレス</dt>
            <dd className="break-all text-gray-900" data-testid="current-email">
              {user.email}
            </dd>
          </dl>
        </section>

        <section className="rounded-xl bg-white p-6 shadow-md">
          <h2 className="mb-2 text-lg font-bold text-gray-900">メールアドレスを変える</h2>
          <p className="mb-4 text-sm text-gray-600">
            卒業などで今のアドレスが使えなくなるときは、個人のアドレスなどに変えてください。記録・役割・パスワードはそのままです。
            アドレスはログインに使うだけなので、確認のメールで確かめることはしません。打ち間違えないように気をつけてください。
          </p>
          {done && (
            <p role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              {done}
            </p>
          )}
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label htmlFor="account-email" className="mb-2 block text-sm text-gray-700">
                新しいメールアドレス
              </label>
              <input
                id="account-email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="account-email-confirm" className="mb-2 block text-sm text-gray-700">
                新しいメールアドレス（確認）
              </label>
              <input
                id="account-email-confirm"
                type="email"
                autoComplete="off"
                required
                maxLength={254}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="account-password" className="mb-2 block text-sm text-gray-700">
                今のパスワード
              </label>
              <input
                id="account-password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={MAX_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            <ErrorText message={error} />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-green-600 py-3 text-white transition-colors hover:bg-green-700 disabled:opacity-60"
            >
              {busy ? '変更中…' : 'メールアドレスを変更する'}
            </button>
          </form>
          <p className="mt-4 text-xs text-gray-500">
            パスワードを忘れたときは、管理者に再設定のリンクを発行してもらってから変えてください。
          </p>
        </section>
      </main>
    </PageBackground>
  );
}
