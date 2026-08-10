-- ─────────────────────────────────────────────
-- storage.objects — fotoğrafların kendisi
--
-- Veritabanındaki photos tablosu sadece YOLU tutuyor; dosyanın kendisi
-- storage'da. Yani photos tablosunu mükemmel korusak bile, storage tarafı açık
-- olsaydı herkes herkesin fotoğrafını indirebilirdi. Koruma orada da RLS ile
-- yapılıyor, ama farklı bir mantıkla: sahiplik kolondan değil DOSYA YOLUNDAN
-- okunuyor (0003_storage_policies.sql).
--
--   yol yapısı: {user_id}/{entry_id}/{dosya}.jpg
--   politika  : (storage.foldername(name))[1] = auth.uid()::text
--
-- Bu, yolun ilk klasörünün kullanıcının kendi kimliği olmasını şart koşuyor.
-- lib/storage.ts yolları hep bu kalıpla üretiyor (uploadPhoto, uploadThumb,
-- uploadAvatar) — testler hem o kalıbın çalıştığını hem de kalıp dışına
-- çıkmanın engellendiğini ölçüyor.
--
-- Yardımcı fonksiyonların ne işe yaradığı 01_profiles.sql içinde anlatılıyor.
-- ─────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon, authenticated;
set local search_path = public, extensions;

select plan(10);

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

insert into storage.buckets (id, name) values ('photos', 'photos')
on conflict (id) do nothing;

insert into storage.objects (bucket_id, name) values
  ('photos', '11111111-1111-1111-1111-111111111111/gun-1/1.jpg'),
  ('photos', '22222222-2222-2222-2222-222222222222/gun-1/1.jpg');

-- ─────────────────────────────────────────────
-- A KULLANICISI OLARAK
-- ─────────────────────────────────────────────
select public.rls_test_as_user('11111111-1111-1111-1111-111111111111');
set local role authenticated;

select is(
  (select count(*)::int from storage.objects),
  1,
  'A depoda yalnizca kendi klasorundeki dosyayi goruyor'
);

select is(
  (select count(*)::int from storage.objects
    where name like '22222222-2222-2222-2222-222222222222/%'),
  0,
  'A baskasinin klasorunu listeleyemiyor'
);

select is(
  public.rls_test_affected(
    $$ insert into storage.objects (bucket_id, name)
       values ('photos', '11111111-1111-1111-1111-111111111111/gun-2/1.jpg') $$),
  1,
  'A kendi klasorune dosya yukleyebiliyor'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('photos', '22222222-2222-2222-2222-222222222222/gun-2/sahte.jpg') $$,
  '42501'::char(5), null,
  'A baskasinin klasorune dosya yukleyemiyor'
);

-- Profil fotoğrafı aynı bucket'ta, sadece alt klasör farklı ({user_id}/avatar/).
-- 0006_add_avatar_path.sql bunun için ayrı politika gerekmediğini söylüyordu;
-- doğru olduğunu burada ölçüyoruz.
select is(
  public.rls_test_affected(
    $$ insert into storage.objects (bucket_id, name)
       values ('photos', '11111111-1111-1111-1111-111111111111/avatar/a.jpg') $$),
  1,
  'profil fotografi ayri politika gerektirmeden kendi klasorune yukleniyor'
);

-- Klasörsüz (bucket kökünde) dosya: yolun ilk klasörü yok, karşılaştırma NULL
-- döner ve izin verilmez. Yoksa herkesin gördüğü ortak bir alan oluşurdu.
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('photos', 'kok-dizinde-dosya.jpg') $$,
  '42501'::char(5), null,
  'bucket kokune klasorsuz dosya birakilamiyor'
);

-- Supabase'in storage şemasında, RLS'ten BAĞIMSIZ ikinci bir koruma var:
-- protect_objects_delete tetikleyicisi, storage.objects üzerinde doğrudan SQL
-- ile yapılan her DELETE'i reddediyor ("Use the Storage API instead"). Amacı
-- güvenlik değil veri tutarlılığı: satır silinip dosya diskte kalmasın diye.
-- Storage API dosyayı sildikten sonra bu ayarı açıp satırı siliyor; testte de
-- aynısını yapıyoruz, yoksa RLS'e hiç sıra gelmeden tetikleyiciye takılırdık.
select set_config('storage.allow_delete_query', 'true', true);

select is(
  public.rls_test_affected(
    $$ delete from storage.objects
        where name = '22222222-2222-2222-2222-222222222222/gun-1/1.jpg' $$),
  0,
  'A baskasinin dosyasini silemiyor'
);

select is(
  public.rls_test_affected(
    $$ delete from storage.objects
        where name = '11111111-1111-1111-1111-111111111111/gun-1/1.jpg' $$),
  1,
  'A kendi dosyasini silebiliyor'
);

-- ─────────────────────────────────────────────
-- OTURUMSUZ (anon) KULLANICI
-- ─────────────────────────────────────────────
reset role;
select public.rls_test_as_anon();
set local role anon;

select is(
  (select count(*)::int from storage.objects),
  0,
  'oturum acmamis istemci hicbir dosya goremiyor'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('photos', '11111111-1111-1111-1111-111111111111/gun-3/1.jpg') $$,
  '42501'::char(5), null,
  'oturum acmamis istemci dosya yukleyemiyor'
);

reset role;
select * from finish();
rollback;
