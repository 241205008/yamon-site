import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** ログイン前の画面（ログイン・登録・初回セットアップ・パスワード再設定）に共通のカード */
export function AuthCard({ icon: Icon, subtitle, children }: { icon: LucideIcon; subtitle: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-600">
            <Icon className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">やもんサイト</h1>
          <p className="mt-2 text-gray-600">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
