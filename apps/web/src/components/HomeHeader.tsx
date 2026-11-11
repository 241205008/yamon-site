import { can, type SessionUser } from '@yamon/shared';
import { Calendar, CircleHelp, Database as DbIcon, List, LogOut, Map as MapIcon, MapPin, Shield, UserCog } from 'lucide-react';
import { Link } from 'react-router';

const navBtn = 'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap text-white transition-colors';
/**
 * 遷移ボタンの色（管理者画面以外は緑にそろえる、#86）。白い小さい文字が読めるよう、green-600（約3.3:1）ではなく
 * green-700（約5.0:1、WCAG AA の 4.5:1 以上）にする
 */
const navGreen = 'bg-green-700 hover:bg-green-800';
/** ヘッダーの右端の、文字だけのリンク（アカウント・ログアウト・使い方） */
const textLink = 'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors';

/**
 * ホームのヘッダー（#79、D53）。色付きのボタンは画面の切り替え、文字だけのリンク（アカウント・ログアウト・使い方）は右端にまとめる。
 * - xl 以上：ロゴ・ボタン・文字のリンクを1行に並べる
 * - sm〜xl：1行目にロゴと文字のリンク、2行目にボタン
 * - sm 未満（スマホ）：ロゴ、ボタン（2列。奇数個なら最後は2列分）、文字のリンク（右寄せ）の順
 */
export function HomeHeader({
  user,
  showCreatures,
  onToggleCreatures,
  onLogout,
}: {
  user: SessionUser;
  showCreatures: boolean;
  onToggleCreatures: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3 sm:px-6 sm:py-4">
        <div className="order-1 mr-auto flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-600">
            <DbIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl leading-tight font-bold text-gray-900">やもんサイト</h1>
            <p className="text-sm text-gray-600">生き物観察記録システム</p>
          </div>
        </div>
        <nav
          aria-label="画面の切り替え"
          className="order-2 grid w-full grid-cols-2 gap-2 sm:order-3 [&>:last-child:nth-child(odd)]:col-span-2 sm:flex sm:flex-wrap xl:order-2 xl:w-auto"
        >
          {can(user.role, 'users.manage') && (
            <Link to="/admin" className={`${navBtn} bg-purple-600 hover:bg-purple-700`}>
              <Shield className="h-4 w-4" />
              管理者画面
            </Link>
          )}
          <Link to="/event-list" className={`${navBtn} ${navGreen}`}>
            <Calendar className="h-4 w-4" />
            観察会一覧
          </Link>
          <button
            type="button"
            onClick={onToggleCreatures}
            aria-pressed={showCreatures}
            className={`${navBtn} ${navGreen} ${showCreatures ? 'ring-2 ring-green-300' : ''}`}
          >
            <List className="h-4 w-4" />
            生き物管理
          </button>
          <Link to="/locations" className={`${navBtn} ${navGreen}`}>
            <MapPin className="h-4 w-4" />
            場所別の生き物
          </Link>
          <Link to="/map" className={`${navBtn} ${navGreen}`}>
            <MapIcon className="h-4 w-4" />
            マップを見る
          </Link>
        </nav>
        <div className="order-3 flex w-full flex-wrap items-center justify-end gap-1 sm:order-2 sm:w-auto xl:order-3 xl:border-l xl:border-gray-200 xl:pl-2">
          {/* メールアドレスの変更（#84）。どの役割にも出す */}
          <Link to="/account" className={`${textLink} text-gray-700 hover:bg-gray-100`}>
            <UserCog className="h-4 w-4" />
            アカウント
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className={`${textLink} text-gray-700 hover:bg-gray-100`}
          >
            <LogOut className="h-4 w-4" />
            ログアウト
          </button>
          <Link to="/guide" className={`${textLink} text-blue-600 hover:bg-blue-50 hover:text-blue-700`}>
            <CircleHelp className="h-4 w-4" />
            使い方
          </Link>
        </div>
      </div>
    </header>
  );
}
