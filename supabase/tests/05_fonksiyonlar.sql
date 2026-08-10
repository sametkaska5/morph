-- ─────────────────────────────────────────────
-- email_lookup_throttle · email_exists · delete_own_account
--
-- Bu üçü RLS'in ANLATAMADIĞI korumaların yeri. RLS satır süzer; burada ise
-- soru şu: kullanıcının hiç dokunmaması gereken bir tabloya erişimi tamamen
-- kapalı mı, ve süper kullanıcı yetkisiyle çalışan fonksiyonlar (security
-- definer) o yetkiyi yalnızca çağıranın kendi verisi için mi kullanıyor?
--
-- security definer = fonksiyon, çağıranın değil sahibinin (postgres)
-- yetkisiyle çalışır, yani RLS onu bağlamaz. Bu yüzden fonksiyonun İÇİNDEKİ
-- "where id = auth.uid()" tek koruma katmanıdır. Orada bir hata olsa hiçbir
-- politika yakalamaz — sadece bu testler yakalar.
--
-- Yardımcı fonksiyonların ne işe yaradığı 01_profiles.sql içinde anlatılıyor.
-- ─────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon, authenticated;
set local search_path = public, extensions;

select plan(17);

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

insert into public.entries (user_id, date, type) values
  ('11111111-1111-1111-1111-111111111111', '2025-01-01', 'log'),
  ('22222222-2222-2222-2222-222222222222', '2025-01-01', 'log');

-- ─────────────────────────────────────────────
-- 1) email_lookup_throttle: hiç kimseye açık değil
-- Burada koruma RLS değil, doğrudan yetki iptali (revoke). Fark önemli:
-- RLS satır süzer ve "boş sonuç" döner; revoke ise sorguyu hata ile durdurur.
-- ─────────────────────────────────────────────
select public.rls_test_as_user('11111111-1111-1111-1111-111111111111');
set local role authenticated;

select throws_ok(
  $$ select * from public.email_lookup_throttle $$,
  '42501'::char(5), null,
  'giris yapmis kullanici hiz siniri sayacini okuyamiyor'
);

select throws_ok(
  $$ insert into public.email_lookup_throttle (client_key) values ('sahte') $$,
  '42501'::char(5), null,
  'giris yapmis kullanici hiz siniri sayacina yazamiyor'
);

reset role;
select public.rls_test_as_anon();
set local role anon;

select throws_ok(
  $$ select * from public.email_lookup_throttle $$,
  '42501'::char(5), null,
  'oturum acmamis istemci hiz siniri sayacini okuyamiyor'
);

-- auth.users'a doğrudan erişim yok — email_exists RPC'sinin var olma sebebi bu.
select throws_ok(
  $$ select email from auth.users $$,
  '42501'::char(5), null,
  'istemci auth.users tablosunu dogrudan okuyamiyor'
);

reset role;

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'email_lookup_throttle'),
  0,
  'sayac tablosunda bilerek hicbir politika yok, erisim tamamen kapali'
);

-- ─────────────────────────────────────────────
-- 2) email_exists: yalnızca boolean sızdırıyor
-- ─────────────────────────────────────────────
select public.rls_test_as_anon();
set local role anon;

select is(
  public.email_exists('a@remory.test'),
  true,
  'kayitli e-posta icin true donuyor'
);

select is(
  public.email_exists('yok@remory.test'),
  false,
  'kayitsiz e-posta icin false donuyor'
);

select is(
  public.email_exists('  A@REMORY.TEST  '),
  true,
  'buyuk harf ve bosluk farki sonucu degistirmiyor'
);

-- ─────────────────────────────────────────────
-- 3) email_exists hız sınırı
-- Sayacı sıfırlayıp temiz bir pencereden başlıyoruz (yukarıdaki üç çağrı da
-- sayılmıştı). Anahtar X-Forwarded-For'un EN SAĞINDAKİ değer: soldakiler
-- istemci tarafından uydurulabildiği için sağdan okunuyor.
-- ─────────────────────────────────────────────
reset role;
delete from public.email_lookup_throttle;
select public.rls_test_as_anon();
select set_config('request.headers',
  '{"x-forwarded-for":"9.9.9.9, 1.2.3.4"}', true);
set local role anon;

-- Sınır 10 dakikada 10; ilk 10 çağrı geçmeli.
select public.email_exists('a@remory.test') from generate_series(1, 10);

select throws_ok(
  $$ select public.email_exists('a@remory.test') $$,
  'P0001'::char(5), null,
  'on birinci cagri hiz sinirina takiliyor'
);

-- Saldırganın soldaki sahte değeri değiştirmesi sınırı atlatmıyor.
select set_config('request.headers',
  '{"x-forwarded-for":"bambaska-uydurma-ip, 1.2.3.4"}', true);

select throws_ok(
  $$ select public.email_exists('a@remory.test') $$,
  'P0001'::char(5), null,
  'sahte X-Forwarded-For degeri eklemek hiz sinirini atlatmiyor'
);

-- Gerçekten başka bir istemci ise kendi sayacıyla devam ediyor.
select set_config('request.headers',
  '{"x-forwarded-for":"9.9.9.9, 5.6.7.8"}', true);

select lives_ok(
  $$ select public.email_exists('a@remory.test') $$,
  'farkli bir istemcinin sayaci ayri tutuluyor'
);

-- ─────────────────────────────────────────────
-- 4) delete_own_account: yalnızca çağıranın kendi hesabı
-- ─────────────────────────────────────────────
reset role;
select public.rls_test_as_anon();
set local role anon;

select throws_ok(
  $$ select public.delete_own_account() $$,
  '42501'::char(5), null,
  'oturum acmamis istemci hesap silme fonksiyonunu cagiramiyor'
);

reset role;
select public.rls_test_as_user('11111111-1111-1111-1111-111111111111');
set local role authenticated;

select public.delete_own_account();

reset role;

select is(
  (select count(*)::int from auth.users
    where id = '11111111-1111-1111-1111-111111111111'),
  0,
  'fonksiyon cagiranin kendi hesabini siliyor'
);

select is(
  (select count(*)::int from auth.users
    where id = '22222222-2222-2222-2222-222222222222'),
  1,
  'fonksiyon baska hicbir hesaba dokunmuyor'
);

select is(
  (select count(*)::int from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'),
  0,
  'hesap silinince profil de cascade ile gidiyor'
);

select is(
  (select count(*)::int from public.entries
    where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'hesap silinince kullanicinin kayitlari da cascade ile gidiyor'
);

select is(
  (select count(*)::int from public.entries
    where user_id = '22222222-2222-2222-2222-222222222222'),
  1,
  'baska kullanicinin kayitlari yerinde duruyor'
);

select * from finish();
rollback;
