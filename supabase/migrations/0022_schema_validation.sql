-- ─────────────────────────────────────────────
-- SUNUCU TARAFI ŞEMA DOĞRULAMASI (VALIDATION LAYER)
--
-- Zod/Pydantic gibi kütüphanelerin Supabase (PostgREST) mimarisindeki 
-- tam karşılığı PostgreSQL DOMAIN ve CHECK kısıtlamalarıdır.
-- Bu migration, uygulamadaki veri tiplerini "paylaşılan bir katmanda"
-- tanımlar ve ilgili tablolara uygular.
-- ─────────────────────────────────────────────

-- 1. PAYLAŞILAN DOĞRULAMA ŞEMALARI (DOMAINS)

-- Ağırlık, uzunluk gibi ölçüm değerleri (Negatif olamaz, 9999'dan büyük olamaz)
create domain public.valid_measurement_value as numeric
  check (value >= 0 and value <= 9999);

-- Tekrar sayısı (Negatif olamaz, 1000'den büyük olamaz)
create domain public.valid_reps as int
  check (value >= 0 and value <= 1000);

-- Kısa Metin (İsimler vb. için maks 100 karakter)
create domain public.short_text as text
  check (char_length(value) <= 100);

-- Birim (Unit) (Maks 10 karakter, örn: "kg", "cm")
create domain public.unit_text as text
  check (char_length(value) <= 10);

-- Sıra numarası (Negatif olamaz)
create domain public.valid_order_index as int
  check (value >= 0);


-- 2. UÇLARA (TABLOLARA) ŞEMALARIN UYGULANMASI

-- Ölçüm Değerleri
alter table public.measurement_values
  alter column value type public.valid_measurement_value;

-- Antrenman Setleri
alter table public.workout_sets
  alter column reps type public.valid_reps,
  alter column weight type public.valid_measurement_value;

-- Ölçüm Tipleri
alter table public.measurement_types
  alter column name type public.short_text,
  alter column unit type public.unit_text,
  alter column sort_order type public.valid_order_index;

-- Kullanıcı Profilleri
alter table public.profiles
  alter column name type public.short_text;

-- Fotoğraflar ve Antrenman Hareketleri
alter table public.photos
  alter column order_index type public.valid_order_index;

alter table public.workout_items
  alter column order_index type public.valid_order_index;
