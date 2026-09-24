-- measurement_values.measurement_type_id → measurement_types(id) için
-- ON DELETE CASCADE ekleniyor.
--
-- SORUN: Uygulama bir ölçüm tipini silince Postgres, bağlı measurement_values
-- satırları hâlâ durduğundan 23503 (foreign key violation) fırlatıyor.
-- Kullanıcıya "Silinemedi" hatası gösteriliyor — oysa onay diyaloğu
-- "geçmiş değerleri de kaybolacak" diyor, yani CASCADE bekleniyor.
--
-- ÇÖZÜM: FK kısıtını CASCADE ile yeniden tanımlıyoruz. Artık bir ölçüm tipi
-- silindiğinde DB bağlı tüm değerleri otomatik temizler.
--
-- Uygulama katmanında da güvenlik önlemi olarak önce değerler silinip sonra
-- tip siliniyor (bkz. lib/measurementTypes.ts), ama asıl güvence burada.

alter table public.measurement_values
  drop constraint if exists measurement_values_measurement_type_id_fkey;

alter table public.measurement_values
  add constraint measurement_values_measurement_type_id_fkey
    foreign key (measurement_type_id)
    references public.measurement_types(id)
    on delete cascade;
