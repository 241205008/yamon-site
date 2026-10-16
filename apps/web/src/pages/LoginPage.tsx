import { LogIn, UserPlus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ErrorText, inputClass } from '../components/ui';
import { ApiError } from '../lib/api';
import {
  MAX_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  ROLE_LABELS,
  type InvitationInfo,
} from '@yamon/shared';
import { acceptInvitation, fetchSetupNeeded, login, logout, lookupInvitation, useCurrentUser } from '../lib/auth';

const toMessage = (e: unknown) => (e instanceof ApiError ? e.message : '処理に失敗しました');

export function LoginPage() {
  const user = useCurrentUser();
  const [params] = useSearchParams();
  const inviteParam = params.get('invite');
  const [mode, setMode] = useState<'login' | 'register'>(inviteParam ? 'register' : 'login');
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [setupNeeded, setSetupNeeded] = useState(false);

  // ユーザーが1人もいなければ、初回セットアップへ案内する（#4）
  useEffect(() => {
    if (user) return;
    fetchSetupNeeded()
      .then(setSetupNeeded)
      .catch(() => {});
  }, [user]);

  // ログイン中に招待リンクを開いた場合は、勝手にホームへ飛ばさず案内する
  if (user && inviteParam) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <h1 className="text-xl font-bold text-gray-900">招待リンクを開きました</h1>
          <p className="mt-3 text-sm text-gray-600">
            現在 {user.name}（{user.email}）でログインしています。招待されたアカウントを登録するには、ログアウトしてください。
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200"
            >
              ホームへ
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
            >
              ログアウトして登録
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (user) return <Navigate to={from} replace />;
  if (setupNeeded) return <Navigate to="/setup" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-600">
            {mode === 'login' ? <LogIn className="h-8 w-8 text-white" /> : <UserPlus className="h-8 w-8 text-white" />}
          </div>
          <h1 className="text-3xl font-bold text-gray-900">やもんサイト</h1>
          <p className="mt-2 text-gray-600">{mode === 'login' ? '生き物観察記録システム' : '新規登録'}</p>
        </div>

        {mode === 'login' ? (
          <LoginForm onDone={() => navigate(from, { replace: true })} onRegister={() => setMode('register')} />
        ) : (
          <RegisterForm
            initialToken={inviteParam ?? ''}
            onDone={() => navigate('/', { replace: true })}
            onBack={() => setMode('login')}
          />
        )}
      </div>
    </div>
  );
}

function LoginForm({ onDone, onRegister }: { onDone: () => void; onRegister: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      onDone();
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <form onSubmit={submit} className="space-y-6">
        <div>
          <label htmlFor="email" className="mb-2 block text-sm text-gray-700">メールアドレス</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@email.com"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-2 block text-sm text-gray-700">パスワード</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className={inputClass}
          />
        </div>
        <ErrorText message={error} />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-green-600 py-3 text-white transition-colors hover:bg-green-700 disabled:opacity-60"
        >
          {busy ? 'ログイン中…' : 'ログイン'}
        </button>
      </form>

      <div className="mt-6 text-center">
        <button type="button" onClick={() => setShowForgot((v) => !v)} className="text-sm text-green-600 hover:text-green-700">
          パスワードを忘れた方はこちら
        </button>
        {showForgot && (
          <p className="mt-2 text-sm text-gray-600">
            パスワードの再設定は管理者が行います。管理者に連絡し、招待を再発行してもらってください。
          </p>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <p className="text-center text-sm text-blue-800">
          このサイトは招待制です。
          <br />
          管理者からの招待メールを受け取った方のみ新規登録できます。
        </p>
      </div>

      <p className="mt-4 text-center text-sm text-gray-600">
        招待メールをお持ちの方は{' '}
        <button type="button" onClick={onRegister} className="text-green-600 hover:text-green-700">
          新規登録へ進む
        </button>
      </p>
    </>
  );
}

/** 招待リンク（/login?invite=<トークン>）から、名前とパスワードを設定して登録する */
function RegisterForm({
  initialToken,
  onDone,
  onBack,
}: {
  initialToken: string;
  onDone: () => void;
  onBack: () => void;
}) {
  const [token, setToken] = useState(initialToken);
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [checking, setChecking] = useState(Boolean(initialToken));
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async (value: string) => {
    setError(null);
    setChecking(true);
    try {
      setInvitation(await lookupInvitation(value.trim()));
    } catch (err) {
      setInvitation(null);
      setError(toMessage(err));
    } finally {
      setChecking(false);
    }
  };

  // メールのリンクから開いたときは、すぐに招待を確かめる
  useEffect(() => {
    if (initialToken) void check(initialToken);
  }, [initialToken]);

  const register = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('確認用パスワードが一致しません');
      return;
    }
    setBusy(true);
    try {
      await acceptInvitation({ token: token.trim(), name, password });
      onDone();
    } catch (err) {
      setError(toMessage(err));
      // 入力中に招待が使えなくなった（期限切れ・取り消しなど）ときは、トークンの入力に戻す
      if (err instanceof ApiError && err.code.startsWith('invitation_')) setInvitation(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {checking ? (
        <p className="py-6 text-center text-sm text-gray-500">招待を確認しています…</p>
      ) : !invitation ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void check(token);
          }}
          className="space-y-6"
        >
          <div>
            <label htmlFor="token" className="mb-2 block text-sm text-gray-700">招待トークン</label>
            <input
              id="token"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="招待メールに記載されたトークン"
              className={`${inputClass} font-mono text-sm`}
            />
            <p className="mt-1 text-xs text-gray-500">招待メールのリンクから開いた場合は自動で入力されます。</p>
          </div>
          <ErrorText message={error} />
          <button type="submit" className="w-full rounded-lg bg-green-600 py-3 text-white transition-colors hover:bg-green-700">
            次へ
          </button>
        </form>
      ) : (
        <form onSubmit={register} className="space-y-6">
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            招待を確認しました：<span className="font-medium break-all">{invitation.email}</span>
            （{ROLE_LABELS[invitation.role]}）
          </div>
          <div>
            <label htmlFor="name" className="mb-2 block text-sm text-gray-700">ユーザー名</label>
            <input
              id="name"
              required
              maxLength={MAX_NAME_LENGTH}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="new-password" className="mb-2 block text-sm text-gray-700">
              パスワード（{MIN_PASSWORD_LENGTH}文字以上）
            </label>
            <input
              id="new-password"
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
            <label htmlFor="confirm-password" className="mb-2 block text-sm text-gray-700">パスワード（確認）</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
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
            {busy ? '登録中…' : '登録してはじめる'}
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-gray-600">
        アカウントをお持ちの方は{' '}
        <button type="button" onClick={onBack} className="text-green-600 hover:text-green-700">
          ログインへ戻る
        </button>
      </p>
    </>
  );
}
