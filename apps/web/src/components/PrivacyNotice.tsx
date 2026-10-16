import { ShieldCheck } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';

/**
 * 個人情報の扱い（MVP 4章、#35）。登録画面と、ログイン後の /privacy で同じ内容を表示する。
 * 内容を変えるときは docs/MVP.md の4章も合わせて直す
 */
export const PRIVACY_ITEMS = [
  'メールアドレスは、ログインと、招待・パスワード再設定のメールのために使います。',
  '観察した日時と場所は、このサイトの一番大事な記録として保存します。見られるのは部員と OB・OG だけで、それ以外の人には公開しません。',
  '退会すると、名前とメールアドレスは削除されます。観察記録はサークルの記録として残り、記録者は「退会済みユーザー」と表示されます。',
] as const;

/** 登録画面などに埋め込む、個人情報の扱いの枠 */
export function PrivacyNotice({ className = '' }: { className?: string }) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={`rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 ${className}`}
    >
      <h2 id={titleId} className="mb-2 flex items-center gap-1.5 font-bold text-gray-900">
        <ShieldCheck className="h-4 w-4 shrink-0 text-green-600" />
        個人情報の扱い
      </h2>
      <ul className="list-disc space-y-1.5 pl-5 leading-relaxed">
        {PRIVACY_ITEMS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

/** ログイン後の画面の下に出す、個人情報の扱いへのリンク */
export function PrivacyFooter() {
  return (
    <footer className="py-6 text-center text-xs text-gray-500">
      <Link to="/privacy" className="hover:text-gray-700 hover:underline">
        個人情報の扱い
      </Link>
    </footer>
  );
}
