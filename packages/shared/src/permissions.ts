import type { Role } from './master';

/**
 * 役割ごとにできることの対応表（MVP 2章「できること」、D24）。
 * API の権限チェック（apps/api/src/auth/middleware.ts）と画面の表示の両方がここを参照する。
 * 役割を足すときは master.ts の ROLES とここを直す。
 *
 * 「自分の〜のみ」の操作は、ここで役割を見たうえで、canActOn で作成者本人かも確かめる。
 */
export const PERMISSIONS = {
  /** 記録・観察会・地図・場所別一覧を見る */
  'records.view': ['admin', 'officer', 'member', 'viewer'],
  /** 保護対象の生き物の正確な位置を見る（自分の記録は役割によらず正確な位置） */
  'locations.viewExact': ['admin', 'officer'],
  /** 記録を追加する */
  'records.create': ['admin', 'officer', 'member'],
  /** 自分の記録を編集・削除する（OB・OG は自分の過去の記録も不可） */
  'records.editOwn': ['admin', 'officer', 'member'],
  /** 観察会を作る */
  'events.create': ['admin', 'officer', 'member'],
  /** 自分が作った観察会を編集・削除する */
  'events.editOwn': ['admin', 'officer', 'member'],
  /** すべての観察会を編集・削除する */
  'events.editAny': ['admin'],
  /** 生き物を登録・編集・削除する */
  'creatures.manage': ['admin', 'officer', 'member'],
  /** 生き物に「位置を保護する」印を付ける */
  'creatures.protect': ['admin', 'officer'],
  /** 主な場所を追加・編集する */
  'mainLocations.manage': ['admin'],
  /** 地図データを更新する */
  'mapData.update': ['admin'],
  /** 招待、役割の変更、無効化、退会処理 */
  'users.manage': ['admin'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

/** その役割がその操作をできるか */
export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/**
 * 作成者が決まっているもの（記録・観察会）を操作できるか。
 * own の権限があり本人であるか、any の権限（すべてを操作できる）があれば true。
 *
 *   canActOn(user, record.userId, 'records.editOwn')
 *   canActOn(user, event.createdBy, 'events.editOwn', 'events.editAny')
 */
export function canActOn(
  actor: { id: string; role: Role },
  ownerId: string | null,
  own: Permission,
  any?: Permission,
): boolean {
  if (any && can(actor.role, any)) return true;
  return ownerId !== null && ownerId === actor.id && can(actor.role, own);
}
