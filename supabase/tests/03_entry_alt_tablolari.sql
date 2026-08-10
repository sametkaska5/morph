-- ─────────────────────────────────────────────
-- photos · measurement_values · workout_items · workout_sets
--
-- Bu dört tablonun hiçbirinde user_id kolonu YOK. Sahiplik dolaylı kuruluyor:
--
--   photos / measurement_values / workout_items
--     -> auth.uid() = (select user_id from entries where id = entry_id)
--   workout_sets
--     -> set -> workout_item -> entry -> user zinciri
--
-- Buradaki ince nokta: politikanın içindeki alt sorgu da RLS altında çalışır.
-- Yani B nin entry sini sorduğumuzda alt sorgu satırı GÖREMEZ, sonuç NULL olur,
-- NULL = auth.uid() karşılaştırması da NULL (yani doğru değil) döner ve erişim
-- reddedilir. Doğru sonuç, ama "tesadüfen doğru" olmadığını görmek için test
-- etmek gerekiyor: zincir tek halkada kopsa fotoğraflar herkese açılır.
--
-- Yardımcı fonksiyonların ne işe yaradığı 01_profiles.sql içinde anlatılıyor.
-- ─────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon, authenticated;
set local search_path = public, extensions;

select plan(24);

create function public.rls_test_affected(p_sql text) returns integer
language plpgsql as $fn$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$fn$;

create function public.rls_test_as_user(p_user uuid) returns void
language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$fn$;

create function public.rls_test_as_anon() returns void
language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end;
$fn$;

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'a@remory.test', 'x',
   now(), now(), now(), '{"provider":"email"}', '{"name":"Ayse"}'),
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'b@remory.test', 'x',
   now(), now(), now(), '{"provider":"email"}', '{"name":"Burak"}');

insert into public.entries (id, user_id, date, type) values
  ('aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', '2025-01-01', 'log'),
  ('bbbbbbbb-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222', '2025-01-01', 'log');

insert into public.photos (id, entry_id, storage_path) values
  ('aaaaaaaa-1111-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/1.jpg'),
  ('bbbbbbbb-1111-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222/bbbbbbbb-0000-0000-0000-000000000001/1.jpg');

insert into public.measurement_values (entry_id, measurement_type_id, value) values
  ('aaaaaaaa-0000-0000-0000-000000000001',
   (select id from public.measurement_types where user_id is null and name = 'kilo'), 80),
  ('bbbbbbbb-0000-0000-0000-000000000001',
   (select id from public.measurement_types where user_id is null and name = 'kilo'), 90);

insert into public.workout_items (id, entry_id, name) values
  ('aaaaaaaa-2222-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 'bench press'),
  ('bbbbbbbb-2222-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', 'squat');

insert into public.workout_sets (id, workout_item_id, reps, weight) values
  ('aaaaaaaa-3333-0000-0000-000000000001',
   'aaaaaaaa-2222-0000-0000-000000000001', 8, 60),
  ('bbbbbbbb-3333-0000-0000-000000000001',
   'bbbbbbbb-2222-0000-0000-000000000001', 5, 100);

-- ─────────────────────────────────────────────
-- A KULLANICISI OLARAK
-- ─────────────────────────────────────────────
select public.rls_test_as_user('11111111-1111-1111-1111-111111111111');
set local role authenticated;

-- ── photos ──

select is(
  (select count(*)::int from public.photos),
  1,
  'A yalnizca kendi gunune bagli fotografi goruyor'
);

select is(
  public.rls_test_affected(
    $$ insert into public.photos (entry_id, storage_path)
       values ('aaaaaaaa-0000-0000-0000-000000000001', 'a/yeni.jpg') $$),
  1,
  'A kendi gunune fotograf ekleyebiliyor'
);

select throws_ok(
  $$ insert into public.photos (entry_id, storage_path)
     values ('bbbbbbbb-0000-0000-0000-000000000001', 'sahte.jpg') $$,
  '42501'::char(5), null,
  'A baskasinin gunune fotograf ekleyemiyor'
);

select is(
  public.rls_test_affected(
    $$ update public.photos set storage_path = 'ele-gecirildi.jpg'
        where id = 'bbbbbbbb-1111-0000-0000-000000000001' $$),
  0,
  'A baskasinin fotografini guncelleyemiyor'
);

select is(
  public.rls_test_affected(
    $$ delete from public.photos
        where id = 'bbbbbbbb-1111-0000-0000-000000000001' $$),
  0,
  'A baskasinin fotografini silemiyor'
);

-- ── measurement_values ──

select is(
  (select count(*)::int from public.measurement_values),
  1,
  'A yalnizca kendi olcum degerini goruyor'
);

select is(
  public.rls_test_affected(
    $$ insert into public.measurement_values (entry_id, measurement_type_id, value)
       values ('aaaaaaaa-0000-0000-0000-000000000001',
               (select id from public.measurement_types
                 where user_id is null and name = 'bel'), 75) $$),
  1,
  'A kendi gunune olcum degeri girebiliyor'
);

select throws_ok(
  $$ insert into public.measurement_values (entry_id, measurement_type_id, value)
     values ('bbbbbbbb-0000-0000-0000-000000000001',
             (select id from public.measurement_types
               where user_id is null and name = 'bel'), 75) $$,
  '42501'::char(5), null,
  'A baskasinin gunune olcum degeri giremiyor'
);

select is(
  public.rls_test_affected(
    $$ update public.measurement_values set value = 1
        where entry_id = 'bbbbbbbb-0000-0000-0000-000000000001' $$),
  0,
  'A baskasinin olcum degerini guncelleyemiyor'
);

select is(
  public.rls_test_affected(
    $$ delete from public.measurement_values
        where entry_id = 'bbbbbbbb-0000-0000-0000-000000000001' $$),
  0,
  'A baskasinin olcum degerini silemiyor'
);

-- ── workout_items ──

select is(
  (select count(*)::int from public.workout_items),
  1,
  'A yalnizca kendi antrenman hareketini goruyor'
);

select is(
  public.rls_test_affected(
    $$ insert into public.workout_items (entry_id, name)
       values ('aaaaaaaa-0000-0000-0000-000000000001', 'lat pulldown') $$),
  1,
  'A kendi gunune antrenman hareketi ekleyebiliyor'
);

select throws_ok(
  $$ insert into public.workout_items (entry_id, name)
     values ('bbbbbbbb-0000-0000-0000-000000000001', 'sahte hareket') $$,
  '42501'::char(5), null,
  'A baskasinin gunune antrenman hareketi ekleyemiyor'
);

select is(
  public.rls_test_affected(
    $$ update public.workout_items set name = 'ele gecirildi'
        where id = 'bbbbbbbb-2222-0000-0000-000000000001' $$),
  0,
  'A baskasinin antrenman hareketini guncelleyemiyor'
);

select is(
  public.rls_test_affected(
    $$ delete from public.workout_items
        where id = 'bbbbbbbb-2222-0000-0000-000000000001' $$),
  0,
  'A baskasinin antrenman hareketini silemiyor'
);

-- ── workout_sets (uc halkali zincir) ──

select is(
  (select count(*)::int from public.workout_sets),
  1,
  'A yalnizca kendi setini goruyor'
);

select is(
  public.rls_test_affected(
    $$ insert into public.workout_sets (workout_item_id, reps, weight)
       values ('aaaaaaaa-2222-0000-0000-000000000001', 10, 50) $$),
  1,
  'A kendi hareketine set ekleyebiliyor'
);

select throws_ok(
  $$ insert into public.workout_sets (workout_item_id, reps, weight)
     values ('bbbbbbbb-2222-0000-0000-000000000001', 10, 50) $$,
  '42501'::char(5), null,
  'A baskasinin hareketine set ekleyemiyor'
);

select is(
  public.rls_test_affected(
    $$ update public.workout_sets set reps = 999
        where id = 'bbbbbbbb-3333-0000-0000-000000000001' $$),
  0,
  'A baskasinin setini guncelleyemiyor'
);

select is(
  public.rls_test_affected(
    $$ delete from public.workout_sets
        where id = 'bbbbbbbb-3333-0000-0000-000000000001' $$),
  0,
  'A baskasinin setini silemiyor'
);

-- ─────────────────────────────────────────────
-- OTURUMSUZ (anon) KULLANICI
-- Beklenen "0 satır" değil HATA: anon 0014_table_grants.sql ile tablo
-- yetkilerinden çıkarıldı, sorgu RLS'e kadar bile gelmiyor.
-- ─────────────────────────────────────────────
reset role;
select public.rls_test_as_anon();
set local role anon;

select throws_ok(
  $$ select count(*) from public.photos $$,
  '42501'::char(5), null,
  'oturum acmamis istemci photos tablosuna hic erisemiyor'
);

select throws_ok(
  $$ select count(*) from public.measurement_values $$,
  '42501'::char(5), null,
  'oturum acmamis istemci measurement_values tablosuna hic erisemiyor'
);

select throws_ok(
  $$ select count(*) from public.workout_items $$,
  '42501'::char(5), null,
  'oturum acmamis istemci workout_items tablosuna hic erisemiyor'
);

select throws_ok(
  $$ select count(*) from public.workout_sets $$,
  '42501'::char(5), null,
  'oturum acmamis istemci workout_sets tablosuna hic erisemiyor'
);

reset role;
select * from finish();
rollback;
