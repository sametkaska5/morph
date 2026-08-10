-- ─────────────────────────────────────────────
-- TABLO YETKİLERİ AÇIKÇA YAZILIYOR
--
-- SORUN: Bu şema bugüne kadar hiç `grant` ifadesi içermedi. Çalışmasının
-- sebebi Supabase'in "default privileges" (varsayılan ayrıcalıklar)
-- mekanizmasıydı: `postgres` rolü `public` şemasında bir tablo yarattığında
-- anon ve authenticated rollerine otomatik olarak CRUD yetkisi veriliyordu.
-- Bu proje o dönemde kurulduğu için canlıda yetkiler yerinde.
--
-- Ama o varsayılan değişti. Güncel Supabase Postgres imajında (17.6.1.141)
-- postgres'in public şemasında yarattığı tablolar için varsayılan şu:
--
--   anon=Dxtm, authenticated=Dxtm     (D=TRUNCATE x=REFERENCES t=TRIGGER m=MAINTAIN)
--
-- Yani SELECT/INSERT/UPDATE/DELETE yok. Sonuç: bu migration'lardan SIFIRDAN
-- kurulan bir veritabanında (yeni proje, staging, felaket kurtarma, yerel
-- `supabase db reset`) uygulama her sorguda "permission denied for table"
-- alıyor. Şema kendi kendine yeterli değildi; bu dosya onu düzeltiyor.
--
-- NEDEN ÖNEMLİ: Postgres'te iki ayrı izin katmanı var ve sırayla çalışırlar.
--   1) GRANT -> bu rol bu TABLOYA hiç dokunabilir mi
--   2) RLS   -> dokunabiliyorsa HANGİ SATIRLARA
-- RLS ancak GRANT'ten geçildikten sonra devreye girer. İkisi birbirinin yerine
-- geçmez: yetki vermeden politika yazmak da, politika yazmadan yetki vermek de
-- işe yaramaz.
--
-- KARAR: yetki yalnızca `authenticated` rolüne veriliyor.
--   - anon (giriş yapmamış istemci) hiçbir tabloya erişemiyor. Giriş ekranı
--     tabloya hiç bakmıyor; yalnızca auth uçlarını ve `email_exists` RPC'sini
--     kullanıyor (o fonksiyonun execute yetkisi 0013'te ayrıca verilmiş).
--     Böylece anon için RLS ikinci savunma hattı olarak duruyor ama ilk hat
--     zaten kapalı.
--   - service_role'e bilerek yetki verilmiyor: şu an hiçbir sunucu tarafı kod
--     onu kullanmıyor. İleride edge function ya da bakım scripti yazılırsa
--     aynı kalıpla ayrı bir migration'da eklenmeli.
--   - email_lookup_throttle listede YOK: o tablo 0012'de bilerek herkese
--     kapatıldı, yalnızca security definer fonksiyon üzerinden değişiyor.
--
-- Sequence yetkisi gerekmiyor: bütün birincil anahtarlar uuid, serial yok.
-- ─────────────────────────────────────────────

grant select, insert, update, delete on table
  public.profiles,
  public.entries,
  public.photos,
  public.measurement_types,
  public.measurement_values,
  public.notification_settings,
  public.workout_items,
  public.workout_sets
to authenticated;

-- anon'dan açıkça geri alıyoruz. Yeni kurulan bir veritabanında zaten yoklar;
-- bu satırın işi, ESKİ varsayılanlarla kurulmuş canlı veritabanını da aynı
-- noktaya getirmek. İki ortamın aynı olması, testlerin canlıyı temsil etmesi
-- demek — yoksa yerelde yeşil yanan bir test canlı için hiçbir şey söylemez.
revoke all on table
  public.profiles,
  public.entries,
  public.photos,
  public.measurement_types,
  public.measurement_values,
  public.notification_settings,
  public.workout_items,
  public.workout_sets
from anon, public;

-- Bundan sonra public şemasında yaratılacak tablolar da aynı kuralı izlesin.
-- Bu satır olmasa her yeni tablo için grant yazmayı hatırlamak gerekirdi ve
-- unutulduğunda hata "permission denied" olarak, yani politika hatası gibi
-- görünmeyen bir yerden çıkardı.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated;
