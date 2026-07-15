-- Sistem varsayılan ölçümlerinden "göğüs" ve "vücut yağ oranı" kaldırılıyor,
-- yerine "kol çevresi" ekleniyor. Bu iki ölçüme daha önce girilmiş değer varsa
-- foreign key kısıtı (measurement_values -> measurement_types) silmeyi
-- engelleyeceğinden önce o değerleri, sonra ölçüm tipi satırlarını siliyoruz.
delete from public.measurement_values
where measurement_type_id in (
  select id from public.measurement_types
  where user_id is null and name in ('göğüs', 'vücut yağ oranı')
);

delete from public.measurement_types
where user_id is null and name in ('göğüs', 'vücut yağ oranı');

insert into public.measurement_types (name, unit, target_direction, is_default, sort_order) values
  ('kol çevresi', 'cm', 'increase_is_good', true, 3);
