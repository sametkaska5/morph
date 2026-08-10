-- ─────────────────────────────────────────────
-- measurement_types — şemadaki tek PAYLAŞILAN tablo
--
-- Bu tabloda iki tür satır var:
--   user_id IS NULL  -> sistem varsayılanı (kilo, bel, kol çevresi), herkese ait
--   user_id = <uuid> -> kullanıcının kendi eklediği özel ölçüm
--
-- Politikalar (0001 + 0004) bu yüzden komut komut ayrılmış:
--   select -> user_id is null or auth.uid() = user_id   (sistem satırları herkese açık)
--   insert -> with check (auth.uid() = user_id)
--   update -> using (auth.uid() = user_id)
--   delete -> using (auth.uid() = user_id)
--
-- Asıl risk okuma değil YAZMA tarafında: sistem satırları herkesin gördüğü
-- ortak veri. Tek bir kullanıcı "kilo" satırını silebilse ya da adını
-- değiştirebilse, bu bütün kullanıcıları etkilerdi. insert/update/delete
-- politikalarının hepsi user_id eşitliği aradığı için user_id NULL olan
-- satırlarda hiçbiri doğru dönmez — aşağıdaki testler tam olarak bunu ölçüyor.
--
-- Yardımcı fonksiyonların ne işe yaradığı 01_profiles.sql içinde anlatılıyor.
-- ─────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon, authenticated;
set local search_path = public, extensions;

select plan(16);

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

-- Sistem ölçümlerinin sayısını sabit yazmıyoruz: 0007_replace_default_measurements
-- gibi bir migration bu sayıyı değiştirdiğinde test yalan yere kırılmasın diye
-- gerçek değeri okuyup saklıyoruz.
create table public.rls_test_expected as
  select count(*)::int as sistem_sayisi
    from public.measurement_types where user_id is null;
grant select on public.rls_test_expected to anon, authenticated;

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

insert into public.measurement_types (id, user_id, name, unit) values
  ('aaaaaaaa-4444-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'A nin ozel olcumu', 'cm'),
  ('bbbbbbbb-4444-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222', 'B nin ozel olcumu', 'cm');

-- ─────────────────────────────────────────────
-- A KULLANICISI OLARAK — OKUMA
-- ─────────────────────────────────────────────
select public.rls_test_as_user('11111111-1111-1111-1111-111111111111');
set local role authenticated;

select is(
  (select count(*)::int from public.measurement_types where user_id is null),
  (select sistem_sayisi from public.rls_test_expected),
  'A butun sistem olcumlerini goruyor'
);

select is(
  (select count(*)::int from public.measurement_types
    where user_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'A kendi ozel olcumunu goruyor'
);

select is(
  (select count(*)::int from public.measurement_types
    where user_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'A baskasinin ozel olcumunu goremiyor'
);

select is(
  (select count(*)::int from public.measurement_types),
  (select sistem_sayisi + 1 from public.rls_test_expected),
  'A nin gordugu toplam olcum tipi sayisi sistem olcumleri artı kendi olcumu'
);

-- ─────────────────────────────────────────────
-- A KULLANICISI OLARAK — YAZMA
-- ─────────────────────────────────────────────

select is(
  public.rls_test_affected(
    $$ insert into public.measurement_types (id, user_id, name, unit)
       values ('aaaaaaaa-4444-0000-0000-000000000002',
               '11111111-1111-1111-1111-111111111111', 'kalca', 'cm') $$),
  1,
  'A kendi adina ozel olcum ekleyebiliyor'
);

select throws_ok(
  $$ insert into public.measurement_types (user_id, name, unit)
     values ('22222222-2222-2222-2222-222222222222', 'sahte', 'cm') $$,
  '42501'::char(5), null,
  'A baskasinin adina ozel olcum ekleyemiyor'
);

-- Sistem satırı uydurma denemesi: user_id NULL olduğunda auth.uid() = user_id
-- karşılaştırması NULL döner, yani izin verilmez.
select throws_ok(
  $$ insert into public.measurement_types (user_id, name, unit)
     values (null, 'sahte sistem olcumu', 'cm') $$,
  '42501'::char(5), null,
  'A herkese gorunecek sistem olcumu uyduramiyor'
);

select is(
  public.rls_test_affected(
    $$ update public.measurement_types set name = 'ele gecirildi'
        where id = 'bbbbbbbb-4444-0000-0000-000000000001' $$),
  0,
  'A baskasinin ozel olcumunu guncelleyemiyor'
);

select is(
  public.rls_test_affected(
    $$ update public.measurement_types set name = 'ele gecirildi'
        where user_id is null $$),
  0,
  'A sistem olcumlerini guncelleyemiyor'
);

select is(
  public.rls_test_affected(
    $$ delete from public.measurement_types
        where id = 'bbbbbbbb-4444-0000-0000-000000000001' $$),
  0,
  'A baskasinin ozel olcumunu silemiyor'
);

select is(
  public.rls_test_affected(
    $$ delete from public.measurement_types where user_id is null $$),
  0,
  'A sistem olcumlerini silemiyor'
);

select is(
  public.rls_test_affected(
    $$ update public.measurement_types set name = 'A nin olcumu'
        where id = 'aaaaaaaa-4444-0000-0000-000000000001' $$),
  1,
  'A kendi ozel olcumunu guncelleyebiliyor'
);

select is(
  public.rls_test_affected(
    $$ delete from public.measurement_types
        where id = 'aaaaaaaa-4444-0000-0000-000000000002' $$),
  1,
  'A kendi ozel olcumunu silebiliyor'
);

select throws_ok(
  $$ update public.measurement_types
        set user_id = '22222222-2222-2222-2222-222222222222'
      where id = 'aaaaaaaa-4444-0000-0000-000000000001' $$,
  '42501'::char(5), null,
  'A kendi olcumunu baskasinin ustune yazamiyor'
);

-- ─────────────────────────────────────────────
-- OTURUMSUZ (anon) KULLANICI
--
-- Politika sistem ölçümlerini (user_id is null) herkese açık bırakıyor, ama
-- 0014_table_grants.sql anon rolünü tablo yetkilerinden çıkardığı için sorgu
-- oraya kadar gelmiyor bile. Yani politikanın o dalı fiilen yalnızca giriş
-- yapmış kullanıcılara hizmet ediyor; anon için iki kat kapalıyız.
-- ─────────────────────────────────────────────
reset role;
select public.rls_test_as_anon();
set local role anon;

select throws_ok(
  $$ select count(*) from public.measurement_types $$,
  '42501'::char(5), null,
  'oturum acmamis istemci measurement_types tablosuna hic erisemiyor'
);

select throws_ok(
  $$ insert into public.measurement_types (user_id, name, unit)
     values ('11111111-1111-1111-1111-111111111111', 'sahte', 'cm') $$,
  '42501'::char(5), null,
  'oturum acmamis istemci olcum tipi ekleyemiyor'
);

reset role;
select * from finish();
rollback;
