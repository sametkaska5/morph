-- ─────────────────────────────────────────────
-- YAPISAL TESTLER: "hangi tabloda RLS var, hangi komutun politikası eksik"
--
-- Bu dosya tek bir satır veri kullanmaz. Amacı davranışı değil KAPSAMI
-- ölçmek: ileride biri yeni bir tablo eklerse ve RLS açmayı ya da bir komutun
-- politikasını yazmayı unutursa, diğer dosyalardaki davranış testleri o tabloyu
-- hiç bilmediği için sessiz kalır — burası kırılır.
--
-- Neden önemli: 0004_measurement_type_delete_policy.sql tam olarak bu hatayı
-- düzeltiyordu (delete politikası unutulmuştu, kullanıcılar kendi ölçüm
-- tiplerini silemiyordu). O hata bu dosyadaki 3 numaralı testle ilk gün
-- yakalanırdı.
-- ─────────────────────────────────────────────

begin;

-- pgTAP'i işlemin (transaction) içinde kuruyoruz; dosyanın sonundaki rollback
-- ile geri alınıyor, yani üretim şemasına kalıcı hiçbir şey eklenmiyor.
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

-- ── 1) Her public tablosunda RLS açık mı ──
-- RLS kapalıysa politika yazmanın hiçbir anlamı yok: politika sadece RLS açık
-- tabloda değerlendirilir. "Politikayı yazdık ama RLS'i açmadık" sessiz ve
-- tehlikeli bir hata, çünkü her şey çalışıyormuş gibi görünür.
select is_empty(
  $$
    select c.relname::text
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and not c.relrowsecurity
  $$,
  'public semasindaki her tabloda row level security acik'
);

-- ── 2) Test paketi şemadaki bütün tabloları tanıyor mu ──
-- Yeni bir tablo eklendiğinde bu test kırılır. Kırılması doğru: yeni tablonun
-- RLS testleri de yazılsın diye uyarı görevi görüyor.
select set_eq(
  $$
    select c.relname::text
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  $$,
  $$
    values ('profiles'::text), ('entries'), ('photos'), ('measurement_types'),
           ('measurement_values'), ('notification_settings'),
           ('workout_items'), ('workout_sets'), ('email_lookup_throttle')
  $$,
  'RLS testleri semadaki butun tablolari kapsiyor'
);

-- ── 3) Politikası olmayan komut var mı ──
-- RLS açık + o komut için politika yok = komut TAMAMEN reddedilir. Bazen
-- istediğimiz budur (email_lookup_throttle), çoğu zaman ise unutkanlıktır.
-- Aşağıdaki liste "bilerek kapalı bıraktıklarımız"; başka bir şey çıkarsa hata.
select set_eq(
  $$
    select c.relname::text || ':' || t.cmd
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as t(cmd)
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relrowsecurity
       and not exists (
         select 1 from pg_policies p
          where p.schemaname = 'public'
            and p.tablename = c.relname
            and p.cmd in (t.cmd, 'ALL')
       )
  $$,
  $$
    values ('email_lookup_throttle:SELECT'::text),
           ('email_lookup_throttle:INSERT'),
           ('email_lookup_throttle:UPDATE'),
           ('email_lookup_throttle:DELETE')
  $$,
  'politikasi olmayan tek tablo bilerek kapatilan email_lookup_throttle'
);

-- ── 4) Hiçbir politika "herkese açık" değil ──
-- using (true) yazmak RLS'i açık bırakıp kilidi takmamak demektir; tablo
-- korunuyor görünür ama herkes her satırı görür.
select is_empty(
  $$
    select tablename::text || ':' || policyname
      from pg_policies
     where schemaname = 'public'
       and (qual = 'true' or with_check = 'true')
  $$,
  'hicbir politika kosulsuz izin vermiyor'
);

-- ── 5) security definer fonksiyonların search_path degeri sabit mi ──
-- security definer fonksiyon, çağıranın değil SAHİBİNİN (postgres) yetkisiyle
-- çalışır. search_path sabitlenmezse çağıran kendi şemasını arama yoluna
-- sokup fonksiyonun içindeki nitelenmemiş bir referansı kendi tablosuna
-- yönlendirebilir — yani süper kullanıcı yetkisiyle kendi kodunu çalıştırabilir.
select is_empty(
  $$
    select p.proname::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and (p.proconfig is null or not exists (
             select 1 from unnest(p.proconfig) cfg where cfg like 'search\_path=%'
           ))
  $$,
  'her security definer fonksiyonun sabitlenmis search_path degeri var'
);

-- ── 6) storage.objects tablosunda RLS acik mi ──
-- Fotoğraflar veritabanında değil storage'da; oradaki koruma da RLS ile
-- yapılıyor (0003_storage_policies.sql).
select ok(
  (select c.relrowsecurity
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects'),
  'storage.objects tablosunda row level security acik'
);

-- ── 7) storage.objects politika envanteri ──
-- UPDATE politikası bilerek yok: uygulama dosyaların üzerine yazmıyor,
-- her yükleme benzersiz ad üretiyor (bkz. lib/storage.ts uniqueFileName).
select set_eq(
  $$
    select cmd::text from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
  $$,
  $$ values ('SELECT'::text), ('INSERT'), ('DELETE') $$,
  'storage.objects icin select/insert/delete politikalari var, update bilerek yok'
);

select * from finish();
rollback;
