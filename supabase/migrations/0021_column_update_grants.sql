-- ─────────────────────────────────────────────
-- SÜTUN BAZLI GÜNCELLEME (UPDATE) KISITLAMALARI
--
-- RLS (Row Level Security) satır bazında izolasyon sağlar, ancak
-- bir kullanıcı kendisine ait olan kaydı güncellerken normalde 
-- tablodaki tüm sütunlara yazabilir (created_at, is_default, user_id vb.).
--
-- Bu migration, "varsayılanı reddet" yaklaşımıyla kullanıcıların
-- kısıtsız UPDATE yetkisini geri alır ve sadece değiştirmelerinin
-- güvenli olduğu sütunlara (isim, tarih, not vb.) izin verir.
-- ─────────────────────────────────────────────

-- 1. Authenticated rolünden tüm tablolardaki genel UPDATE yetkisini alıyoruz
revoke update on table 
  public.profiles, 
  public.entries, 
  public.photos, 
  public.measurement_types, 
  public.measurement_values, 
  public.notification_settings, 
  public.workout_items, 
  public.workout_sets 
from authenticated;

-- 2. Sadece güvenli olan sütunlara UPDATE yetkisi veriyoruz
-- (id, user_id, entry_id, created_at gibi değerler dışarıda bırakılmıştır)

-- Profiller:
grant update (name, unit_pref) on table public.profiles to authenticated;

-- Kayıtlar (Entries):
grant update (date, type, note, cover_photo_id, updated_at) on table public.entries to authenticated;

-- Fotoğraflar: (storage_path değişmez, sadece sıralama)
grant update (order_index) on table public.photos to authenticated;

-- Ölçüm Tipleri (is_default ve user_id değişemez)
grant update (name, unit, target_direction, sort_order) on table public.measurement_types to authenticated;

-- Ölçüm Değerleri:
grant update (value) on table public.measurement_values to authenticated;

-- Antrenmanlar:
grant update (name, order_index) on table public.workout_items to authenticated;
grant update (reps, weight, order_index) on table public.workout_sets to authenticated;

-- Bildirim Ayarları (Hepsi ayar olduğu için id/user_id hariç hepsi açık):
grant update (past_memory_enabled, streak_enabled, daily_reminder_enabled, reminder_time, quiet_start, quiet_end) on table public.notification_settings to authenticated;
