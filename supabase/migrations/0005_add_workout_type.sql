-- entries.type'a üçüncü bir değer ekliyoruz: 'workout' — fotoğraf çekilmeden spor
-- yapılan günler için. Off day'den farkı: bilinçli dinlenme değil, sadece o gün
-- foto/ölçüm girilmemiş bir antrenman günü. Seri (streak) hesabında log/off_day
-- ile aynı şekilde sayılır, "Toplam Anı" sayacına dahil olmaz (fotoğraf yok).

alter table public.entries drop constraint if exists entries_type_check;

alter table public.entries
  add constraint entries_type_check check (type in ('log', 'off_day', 'workout'));
