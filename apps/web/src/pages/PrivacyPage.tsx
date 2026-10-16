import { PrivacyNotice } from '../components/PrivacyNotice';
import { BackBar, Card, PageBackground } from '../components/ui';
import { useCurrentUser } from '../lib/auth';

/** 個人情報の扱い（#35）。ログインしていなくても読める（登録前に確かめられるように） */
export function PrivacyPage() {
  const user = useCurrentUser();
  return (
    <PageBackground footer={false}>
      <BackBar to={user ? '/' : '/login'} label={user ? 'ホームに戻る' : 'ログインに戻る'} title="個人情報の扱い" />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Card className="p-6">
          <p className="mb-4 text-sm text-gray-600">やもんサイトでは、登録した方の情報を次のように扱います。</p>
          <PrivacyNotice />
        </Card>
      </main>
    </PageBackground>
  );
}
