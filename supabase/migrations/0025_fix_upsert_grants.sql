-- "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
-- UPSERT KISITLAMALARININ DoZELTLMES
--
-- 0021'deki kolon bazl UPDATE kstlamalar, Supabase SDK'nn `.upsert()`
-- iYlemiyle akYyordu. `upsert` komutu (ON CONFLICT DO UPDATE), kayt
-- deYiYtirilirken parametre olarak geilen tǬm sǬtunlarda (user_id, entry_id vb.)
-- UPDATE yetkisi arar (RLS zaten kendi ID'si olduYunu doYrulasa bile).
--
-- Bu migration, ilgili sǬtunlara UPDATE yetkilerini geri vererek
-- "Off day" ve diYer antrenman/log iYlemlerinin hatasz alYmasn saYlar.
-- "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?

-- Kaytlar (Entries): upsert({ user_id, date, type, note })
-- user_id sǬtununu UPDATE edebilme yetkisi gerekiyor.
grant update (user_id) on table public.entries to authenticated;

-- -lǬm DeYerleri (Measurement Values): upsert({ entry_id, measurement_type_id, value })
-- entry_id ve measurement_type_id sǬtunlarn UPDATE edebilme yetkisi gerekiyor.
grant update (entry_id, measurement_type_id) on table public.measurement_values to authenticated;
