import { CATEGORIES, LOCATION_TYPES, ROLES, USER_STATUSES } from '@yamon/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

/**
 * テーブル定義（docs/MVP.md 5章）。変更したら `npm run db:generate -w @yamon/api` で
 * drizzle/ にマイグレーションを作り、一緒にコミットする。
 */

// 固定マスター（packages/shared）を DB の列挙型にする。値を足すときもマイグレーションを作る
export const roleEnum = pgEnum('role', ROLES);
export const userStatusEnum = pgEnum('user_status', USER_STATUSES);
export const categoryEnum = pgEnum('category', CATEGORIES);
export const locationTypeEnum = pgEnum('location_type', LOCATION_TYPES);
export const auditActionEnum = pgEnum('audit_action', ['role_changed', 'disabled', 'enabled', 'withdrawn']);

/**
 * JST の時刻 "HH:MM"（D10）。PostgreSQL の time 型は秒付き（"09:30:00"）で返るため、
 * 画面と入力チェック（packages/shared の timeSchema）と同じ形の文字列で持つ。文字列のまま並べ替えられる
 */
const hhmm = () => text('time').notNull();
const hhmmCheck = (name: string, column: AnyPgColumn) =>
  check(name, sql`${column} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** ユーザー。退会（匿名化）しても記録の参照先として行は残す（D26） */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** 小文字にそろえて保存する。退会したら null にする */
    email: text('email'),
    /** Argon2id のハッシュ（D18）。退会したら null にする */
    passwordHash: text('password_hash'),
    role: roleEnum('role').notNull().default('member'),
    status: userStatusEnum('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('users_email_unique').on(sql`lower(${t.email})`),
    // 退会したユーザーには個人情報とログイン手段を残さない。退会していなければ必ず持つ
    check(
      'users_withdrawn_anonymized',
      sql`(${t.status} = 'withdrawn' and ${t.email} is null and ${t.passwordHash} is null and ${t.withdrawnAt} is not null)
        or (${t.status} <> 'withdrawn' and ${t.email} is not null and ${t.passwordHash} is not null and ${t.withdrawnAt} is null)`,
    ),
  ],
);

/** ログインのセッション。Cookie の値そのものは保存せず、SHA-256 のハッシュを主キーにする（D18） */
export const sessions = pgTable(
  'sessions',
  {
    idHash: text('id_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  // 期限切れのセッションをまとめて消すときに使う
  (t) => [index('sessions_user_id_idx').on(t.userId), index('sessions_expires_at_idx').on(t.expiresAt)],
);

/** 招待（48時間有効・1回限り）。トークンはハッシュで保存する（D18） */
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    email: text('email').notNull(),
    role: roleEnum('role').notNull().default('member'),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('invitations_email_idx').on(sql`lower(${t.email})`)],
);

/** パスワード再設定のトークン（有効期限つき・1回限り）。ハッシュで保存する（D18） */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (t) => [index('password_reset_tokens_user_id_idx').on(t.userId)],
);

/** 操作履歴：役割の変更・無効化・有効化・退会処理を、誰がいつ行ったか（D25） */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    targetUserId: uuid('target_user_id')
      .notNull()
      .references(() => users.id),
    action: auditActionEnum('action').notNull(),
    /** role_changed のときの変更前と変更後 */
    fromRole: roleEnum('from_role'),
    toRole: roleEnum('to_role'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_created_at_idx').on(t.createdAt),
    check(
      'audit_logs_role_change',
      sql`(${t.action} = 'role_changed') = (${t.fromRole} is not null and ${t.toRole} is not null)`,
    ),
  ],
);

/** 生き物。記録から ID で参照する（記録がある生き物は削除できない、D9） */
export const creatures = pgTable('creatures', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  category: categoryEnum('category').notNull(),
  memo: text('memo').notNull().default(''),
  /** 位置を保護する（部員・閲覧のみには約1km単位に丸めた座標を返す、D24） */
  locationProtected: boolean('location_protected').notNull().default(false),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** 主な場所。管理者・幹部が画面から追加・編集する（D27）。記録がある場所は削除せず isActive を false にする */
export const mainLocations = pgTable('main_locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** 観察会。削除しても記録は消さず、記録側の eventId を null にする（#7） */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    mainLocationId: uuid('main_location_id').references(() => mainLocations.id),
    locationName: text('location_name').notNull().default(''),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    /** JST の日付（D10） */
    date: date('date', { mode: 'string' }).notNull(),
    time: hhmm(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('events_date_idx').on(t.date),
    hhmmCheck('events_time_format', t.time),
    check('events_coordinates_pair', sql`(${t.lat} is null) = (${t.lng} is null)`),
  ],
);

/**
 * 観察記録。観察会にはネストせず eventId で紐づけ、生き物・主な場所も ID で参照する（D3）。
 * 月・時間帯は保存せず date / time から導出する。
 */
export const observationRecords = pgTable(
  'observation_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatureId: uuid('creature_id')
      .notNull()
      .references(() => creatures.id),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
    locationType: locationTypeEnum('location_type').notNull(),
    mainLocationId: uuid('main_location_id').references(() => mainLocations.id),
    /** 'other' のときの場所名（'none' のときは空文字） */
    locationName: text('location_name').notNull().default(''),
    /** 座標がない記録は null（0,0 では表さない） */
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    date: date('date', { mode: 'string' }).notNull(),
    time: hhmm(),
    memo: text('memo').notNull().default(''),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('observation_records_date_idx').on(t.date.desc(), t.time.desc()),
    index('observation_records_event_id_idx').on(t.eventId),
    index('observation_records_creature_id_idx').on(t.creatureId),
    index('observation_records_main_location_id_idx').on(t.mainLocationId),
    index('observation_records_user_id_idx').on(t.userId),
    hhmmCheck('observation_records_time_format', t.time),
    check('observation_records_coordinates_pair', sql`(${t.lat} is null) = (${t.lng} is null)`),
    check(
      'observation_records_main_location',
      sql`(${t.locationType} = 'main') = (${t.mainLocationId} is not null)`,
    ),
  ],
);
