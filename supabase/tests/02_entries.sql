-- ─────────────────────────────────────────────
-- entries — uygulamanın kalbi (her gün bir kayıt)
--
-- Politika (0001_init.sql):
--   for all using (auth.uid() = user_id)
--
-- Bu tablo diğer her şeyin sahiplik zinciri: photos, measurement_values,
-- workout_items hepsi "hangi entry'ye bağlıysam onun sahibi benim sahibimdir"
-- diyor. Buradaki bir açık, aşağıdaki bütün tabloları da açar.
--
-- Yardımcı fonksiyonların ne işe yaradığı 01_profiles.sql içinde anlatılıyor.
-- ─────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon, authenticated;
set local search_path = public, extensions;

select plan(12);

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

insert into public.entries (id, user_id, date, type, note) values
  ('aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', '2025-01-01', 'log', 'A nin gunu'),
  ('bbbbbbbb-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222', '2025-01-01', 'log', 'B nin gunu');

-- ─────────────────────────────────────────────
-- A KULLANICISI OLARAK
-- ─────────────────────────────────────────────
select public.rls_test_as_user('11111111-1111-1111-1111-111111111111');
set local role authenticated;

select is(
  (select count(*)::int from public.entries),
  1,
  'A tabloda iki kayit varken yalnizca kendi kaydini goruyor'
);

-- Kimliği bilmek işe yaramıyor: RLS satırı filtreliyor, gizlemiyor değil.
-- Doğrudan id ile sorulduğunda da "yok" cevabı geliyor.
select is(
  (select count(*)::int from public.entries
    where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  0,
  'A baskasinin kaydini id sini bilse bile goremiyor'
);

select is(
  public.rls_test_affected(
    $$ insert into public.entries (id, user_id, date, type)
       values ('aaaaaaaa-0000-0000-0000-000000000002',
               '11111111-1111-1111-1111-111111111111', '2025-02-02', 'workout') $$),
  1,
  'A kendi adina yeni kayit ekleyebiliyor'
);

select throws_ok(
  $$ insert into public.entries (user_id, date, type)
     values ('22222222-2222-2222-2222-222222222222', '2025-03-03', 'log') $$,
  '42501'::char(5), null,
  'A baskasinin adina kayit ekleyemiyor'
);

select is(
  public.rls_test_affected(
    $$ update public.entries set note = 'ele gecirildi'
        where id = 'bbbbbbbb-0000-0000-0000-000000000001' $$),
  0,
  'A baskasinin kaydini guncelleyemiyor'
);

select is(
  public.rls_test_affected(
    $$ delete from public.entries
        where id = 'bbbbbbbb-0000-0000-0000-000000000001' $$),
  0,
  'A baskasinin kaydini silemiyor'
);

select is(
  public.rls_test_affected(
    $$ update public.entries set note = 'guncellendi'
        where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$),
  1,
  'A kendi kaydini guncelleyebiliyor'
);

-- Sahipliği devretme denemesi. USING ifadesi with check olarak da çalıştığı
-- için satırın YENİ hali de A ya ait olmak zorunda.
select throws_ok(
  $$ update public.entries
        set user_id = '22222222-2222-2222-2222-222222222222'
      where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501'::char(5), null,
  'A kendi kaydini baskasinin ustune yazamiyor'
);

select is(
  public.rls_test_affected(
    $$ delete from public.entries
        where id = 'aaaaaaaa-0000-0000-0000-000000000002' $$),
  1,
  'A kendi kaydini silebiliyor'
);

-- B nin kaydi bu islemlerin hicbirinden etkilenmedi mi (postgres gozuyle) ──
reset role;

select is(
  (select note from public.entries where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'B nin gunu',
  'B nin kaydi butun denemelerden sonra hala el degmemis'
);

-- ─────────────────────────────────────────────
-- OTURUMSUZ (anon) KULLANICI
-- Beklenen "0 satır" değil HATA: anon 0014_table_grants.sql ile tablo
-- yetkilerinden çıkarıldı, sorgu RLS'e kadar bile gelmiyor.
-- ─────────────────────────────────────────────
select public.rls_test_as_anon();
set local role anon;

select throws_ok(
  $$ select count(*) from public.entries $$,
  '42501'::char(5), null,
  'oturum acmamis istemci entries tablosuna hic erisemiyor'
);

select throws_ok(
  $$ insert into public.entries (user_id, date, type)
     values ('11111111-1111-1111-1111-111111111111', '2025-04-04', 'log') $$,
  '42501'::char(5), null,
  'oturum acmamis istemci kayit ekleyemiyor'
);

reset role;
select * from finish();
rollback;
