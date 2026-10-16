import { ArrowLeft, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';

/** 画面共通の背景（緑〜青のグラデーション） */
export function PageBackground({
  children,
  tone = 'green',
}: {
  children: ReactNode;
  tone?: 'green' | 'purple';
}) {
  const bg =
    tone === 'purple'
      ? 'bg-gradient-to-br from-purple-50 via-indigo-50/60 to-blue-50'
      : 'bg-gradient-to-br from-green-50 via-emerald-50/40 to-blue-50';
  return <div className={`min-h-screen ${bg}`}>{children}</div>;
}

/** 「ホームに戻る」などの上部バー */
export function BackBar({ to, label, title }: { to: string; label: string; title?: string }) {
  return (
    <header className="sticky top-0 z-[1100] border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          to={to}
          className="flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          {label}
        </Link>
        {title && <h1 className="text-xl font-bold text-gray-900">{title}</h1>}
      </div>
    </header>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-white shadow-md ${className}`}>{children}</div>;
}

export function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'green' | 'blue' | 'purple' | 'yellow';
}) {
  const text = {
    green: 'text-green-600',
    blue: 'text-blue-600',
    purple: 'text-purple-600',
    yellow: 'text-yellow-600',
  }[color];
  return (
    <Card className="p-4">
      <p className="text-sm text-gray-600">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${text}`}>{value}</p>
    </Card>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700">{category}</span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-xl bg-white p-6 shadow-xl ${wide ? 'max-w-3xl' : 'max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}

/** 簡易ページング：最初の pageSize 件を表示し「さらに表示」で増やす */
export function usePaged<T>(items: T[], pageSize = 20) {
  const [count, setCount] = useState(pageSize);
  return {
    visible: items.slice(0, count),
    hasMore: items.length > count,
    rest: Math.max(0, items.length - count),
    showMore: () => setCount((c) => c + pageSize),
  };
}

export function ShowMoreButton({ rest, onClick, loading = false }: { rest: number; onClick: () => void; loading?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="mt-3 w-full rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60"
    >
      {loading ? '読み込み中…' : `さらに表示（残り${rest}件）`}
    </button>
  );
}

type QueryLike = { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };

/** 複数の読み込みのうち、まだ使えないもの（エラーを優先、次に読み込み中）を返す。すべて読めていれば最後のもの */
export function firstUnready(...queries: QueryLike[]): QueryLike {
  return queries.find((q) => q.isError) ?? queries.find((q) => q.isPending) ?? queries[queries.length - 1];
}

/**
 * API からの読み込みの状態（読み込み中・エラー）。読み込めていれば children を出す。
 * エラーのときは「もう一度読み込む」ボタンを出す
 */
export function QueryState({
  query,
  children,
  label = 'データ',
}: {
  query: QueryLike;
  children: ReactNode;
  label?: string;
}) {
  if (query.isPending) {
    return (
      <p role="status" className="py-8 text-center text-sm text-gray-500">
        {label}を読み込み中…
      </p>
    );
  }
  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : '読み込みに失敗しました';
    return (
      <div className="space-y-2 py-4">
        <ErrorText message={`${label}を読み込めませんでした。${message}`} />
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
        >
          もう一度読み込む
        </button>
      </div>
    );
  }
  return <>{children}</>;
}

export const inputClass =
  'w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-500';
