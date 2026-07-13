-- 0001_init.sql'de measurement_types için insert/update politikaları vardı ama
-- delete politikası hiç eklenmemişti — RLS açıkken policy olmayan komut varsayılan
-- olarak reddedilir, yani kullanıcılar kendi özel ölçüm tiplerini silemiyordu.

create policy "özel ölçüm silme sahibine özel" on public.measurement_types
  for delete using (auth.uid() = user_id);
