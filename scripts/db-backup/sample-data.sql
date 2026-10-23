-- バックアップと復元の確認（.github/workflows/backup.yml の verify）で入れるテスト用のデータ。
-- 実在の人・場所ではない。退会済み・保護対象・改行や引用符を含む文字・座標のない記録など、戻し損ねやすい形を混ぜる
insert into users (id, name, email, password_hash, role) values
  ('00000000-0000-4000-8000-000000000001', '管理者 テスト', 'admin@example.com', '$argon2id$v=19$m=19456,t=2,p=1$dummy$dummy', 'admin'),
  ('00000000-0000-4000-8000-000000000002', '部員 テスト', 'Member@Example.com', '$argon2id$v=19$m=19456,t=2,p=1$dummy$dummy', 'member');
insert into users (id, name, role, status, withdrawn_at) values
  ('00000000-0000-4000-8000-000000000003', '退会済みユーザー', 'member', 'withdrawn', '2026-10-01T00:00:00Z');

insert into main_locations (id, name, lat, lng, sort_order) values
  ('00000000-0000-4000-8000-000000000011', '森林公園（テスト）', 35.2345, 136.9876, 0),
  ('00000000-0000-4000-8000-000000000012', '使わない場所', 35.1, 136.8, 1);
update main_locations set is_active = false where id = '00000000-0000-4000-8000-000000000012';

insert into creatures (id, name, category, memo, location_protected, created_by) values
  ('00000000-0000-4000-8000-000000000021', 'カブトムシ', 'インセクター', '', false, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000022', 'オオタカ', 'バーダー', E'1行目\n2行目 "引用符" と ''単引用符'' と ' || chr(92), true, '00000000-0000-4000-8000-000000000002');

insert into events (id, name, main_location_id, date, time, created_by) values
  ('00000000-0000-4000-8000-000000000031', '秋の観察会', '00000000-0000-4000-8000-000000000011', '2026-10-18', '09:30', '00000000-0000-4000-8000-000000000001');
insert into events (id, name, location_name, lat, lng, date, time, created_by) values
  ('00000000-0000-4000-8000-000000000032', '夜の観察会', '川沿い', 35.13872, 136.98765, '2026-10-19', '19:00', '00000000-0000-4000-8000-000000000002');

insert into observation_records (creature_id, event_id, location_type, main_location_id, date, time, user_id) values
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000031', 'main', '00000000-0000-4000-8000-000000000011', '2026-10-18', '10:00', '00000000-0000-4000-8000-000000000002');
insert into observation_records (creature_id, event_id, location_type, location_name, lat, lng, date, time, memo, user_id) values
  ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000032', 'other', '川沿い', 35.13872, 136.98765, '2026-10-19', '19:15', 'メモ', '00000000-0000-4000-8000-000000000003');
insert into observation_records (creature_id, location_type, date, time, user_id) values
  ('00000000-0000-4000-8000-000000000021', 'none', '2026-10-20', '07:05', '00000000-0000-4000-8000-000000000002');
