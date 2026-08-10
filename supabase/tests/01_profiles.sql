-- ─────────────────────────────────────────────
-- profiles + notification_settings
--
-- Politikalar (0001_init.sql):
--   profiles              -> for all using (auth.uid() = id)
--   notification_settings -> for all using (auth.uid() = user_id)
--
-- ÖNEMLİ AYRINTI: "for all using (...)" yazıp "with check" yazmadığımızda
-- PostgreSQL, USING ifadesini yazma kontrolü olarak da kullanır. Yani okuma
-- filtresiyle yazma kilidi aynı ifadeden gelir. Bu dosya sadece "başkasının
-- satırını göremiyorum"u değil, "başkasının adına satır yazamıyorum"u da
-- doğruluyor — asıl tehlikeli olan ikincisi.
--
-- Ayrıca 0002_auth_trigger.sql'in gerçekten çalıştığını da ölçüyor: yeni
-- kullanıcı auth.users'a düştüğü anda profiles ve notification_settings
-- satırları oluşuyor mu.
-- ─────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon, authenticated;
set local search_path = public, extensions;

select plan(15);

-- ─────────────────────────────────────────────
-- YARDIMCILAR
-- İşlem sonundaki rollback ile birlikte silinirler; üretim şemasında iz
-- bırakmazlar. public şemasında duruyorlar çünkü pg_temp şeması yalnızca onu
-- oluşturan role açıktır, biz ise test sırasında rol değiştiriyoruz.
-- ─────────────────────────────────────────────

-- RLS sessiz çalışır: başkasının satırını UPDATE/DELETE etmek HATA VERMEZ,
-- sadece hiçbir satırı etkilemez. Bu yüzden "kaç satır etkilendi"yi ölçmemiz
-- gerekiyor. Fonksiyon security definer DEĞİL — çağıranın yetkisiyle çalışır,
-- dolayısıyla RLS aynen uygulanır.
create function public.rls_test_affected(p_sql text) returns integer
language plpgsql as $fn$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$fn$;

-- auth.uid() aslında bir oturum değişkeni okur: PostgREST her istekte JWT'nin
-- içeriğini "request.jwt.claims" ayarına yazar. Testte JWT üretmeye gerek yok,
-- aynı ayarı elle yazmak yeterli. (Eski ve yeni auth.uid() sürümleri farklı
-- ayar adı okuduğu için ikisini birden dolduruyoruz.)
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

-- ─────────────────────────────────────────────
-- VERİ: iki gerçek kullanıcı
-- ─────────────────────────────────────────────
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

-- ── 0002_auth_trigger.sql calisiyor mu (postgres gozuyle) ──

select is(
  (select count(*)::int from public.profiles),
  2,
  'yeni kullanici kayit olunca profil satiri otomatik olusuyor'
);

select is(
  (select count(*)::int from public.notification_settings),
  2,
  'yeni kullanici kayit olunca bildirim ayari satiri otomatik olusuyor'
);

select is(
  (select name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Ayse',
  'kayit sirasindaki ad metadata icinden profile tasiniyor'
);

-- ─────────────────────────────────────────────
-- A KULLANICISI OLARAK
-- ─────────────────────────────────────────────
select public.rls_test_as_user('11111111-1111-1111-1111-111111111111');
set local role authenticated;

select is(
  (select count(*)::int from public.profiles),
  1,
  'A tabloda iki profil olmasina ragmen yalnizca bir tane goruyor'
);

select is(
  (select id from public.profiles),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'A nin gordugu tek profil kendisininki'
);

select is(
  public.rls_test_affected(
    $$ update public.profiles set name = 'ele gecirildi'
        where id = '22222222-2222-2222-2222-222222222222' $$),
  0,
  'A baskasinin profilini guncelleyemiyor'
);

select is(
  public.rls_test_affected(
    $$ update public.profiles set name = 'Ayse K'
        where id = '11111111-1111-1111-1111-111111111111' $$),
  1,
  'A kendi profilini guncelleyebiliyor'
);

select throws_ok(
  $$ insert into public.profiles (id, name)
     values ('22222222-2222-2222-2222-222222222222', 'sahte') $$,
  '42501'::char(5), null,
  'A baskasinin adina profil satiri ekleyemiyor'
);

-- Satırı "başkasına devretme" denemesi: USING ifadesi with check olarak da
-- çalıştığı için yeni haldeki id de auth.uid() ile eşleşmek zorunda.
select throws_ok(
  $$ update public.profiles
        set id = '22222222-2222-2222-2222-222222222222'
      where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501'::char(5), null,
  'A kendi profilini baskasinin uzerine tasiyamiyor'
);

select is(
  (select count(*)::int from public.notification_settings),
  1,
  'A yalnizca kendi bildirim ayarlarini goruyor'
);

select is(
  public.rls_test_affected(
    $$ update public.notification_settings set daily_reminder_enabled = false
        where user_id = '22222222-2222-2222-2222-222222222222' $$),
  0,
  'A baskasinin bildirim ayarlarini kapatamiyor'
);

select is(
  public.rls_test_affected(
    $$ update public.notification_settings set daily_reminder_enabled = false
        where user_id = '11111111-1111-1111-1111-111111111111' $$),
  1,
  'A kendi bildirim ayarlarini degistirebiliyor'
);

select throws_ok(
  $$ insert into public.notification_settings (user_id)
     values ('22222222-2222-2222-2222-222222222222') $$,
  '42501'::char(5), null,
  'A baskasi icin bildirim ayari satiri ekleyemiyor'
);

-- ─────────────────────────────────────────────
-- OTURUMSUZ (anon) KULLANICI
--
-- Burada beklenen "0 satır" değil, HATA. Çünkü anon rolü 0014_table_grants.sql
-- ile tablo yetkilerinden tamamen çıkarıldı — sorgu RLS'e kadar bile gelmiyor,
-- daha tablo seviyesinde reddediliyor. İki katmanın farkı tam olarak bu:
--   yetki yoksa -> hata (42501)
--   yetki varsa, politika eşleşmiyorsa -> boş sonuç, hata yok
-- ─────────────────────────────────────────────
reset role;
select public.rls_test_as_anon();
set local role anon;

select throws_ok(
  $$ select count(*) from public.profiles $$,
  '42501'::char(5), null,
  'oturum acmamis istemci profiles tablosuna hic erisemiyor'
);

select throws_ok(
  $$ select count(*) from public.notification_settings $$,
  '42501'::char(5), null,
  'oturum acmamis istemci notification_settings tablosuna hic erisemiyor'
);

reset role;
select * from finish();
rollback;
