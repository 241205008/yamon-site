import { can } from '@yamon/shared';
import { CreatureManager } from '../components/CreatureManager';
import { BackBar, PageBackground } from '../components/ui';
import { useCurrentUser } from '../lib/auth';

/** 生き物管理の専用ページ（#97）。ほかのヘッダーのボタン（観察会一覧・場所別の生き物・マップ）と同じく、ホームから移って開く */
export function CreaturesPage() {
  const user = useCurrentUser()!;
  return (
    <PageBackground>
      <BackBar to="/" label="ホーム画面に戻る" />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <CreatureManager canManage={can(user.role, 'creatures.manage')} canProtect={can(user.role, 'creatures.protect')} />
      </main>
    </PageBackground>
  );
}
