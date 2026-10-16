import { LogIn, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ErrorText, inputClass } from '../components/ui';
import { ApiError } from '../lib/api';
import { login, logout, useCurrentUser } from '../lib/auth';

const toMessage = (e: unknown) => (e instanceof ApiError ? e.message : '処理に失敗しました');

export function LoginPage() {
  const user = useCurrentUser();
  const [params] = useSearchParams();
  const inviteParam = params.get('invite');
  const [mode, setMode] = useState<'login' | 'register'>(inviteParam ? 'register' : 'login');
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

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
          <RegisterPending onBack={() => setMode('login')} />
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

/**
 * 招待リンクからの登録は、#12 で API に切り替える。それまでは案内だけを出す
 * （ログインが API になったため、ブラウザの中だけで登録しても、そのアカウントではログインできない）
 */
function RegisterPending({ onBack }: { onBack: () => void }) {
  return (
    <>
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
        招待リンクからの登録は準備中です。登録できるようになるまで、管理者にお問い合わせください。
      </div>
      <p className="mt-6 text-center text-sm text-gray-600">
        アカウントをお持ちの方は{' '}
        <button type="button" onClick={onBack} className="text-green-600 hover:text-green-700">
          ログインへ戻る
        </button>
      </p>
    </>
  );
}
