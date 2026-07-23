-- ─────────────────────────────────────────────
-- PHOTO THUMBNAILS
--
-- Supabase'in sunucu tarafı görsel dönüşümü (render/image) yalnızca ücretli
-- planlarda açık. Free planda ızgaralara tam boy fotoğraf inmesin diye,
-- yükleme anında istemcide ayrıca küçük bir kopya üretip storage'a yazıyoruz.
--
-- NULL = bu satır thumbnail özelliğinden ÖNCE yazılmış (eski kayıt) ya da
-- thumbnail üretimi başarısız olmuş. Okuyan taraf bu durumda storage_path'e
-- geri düşer, yani eski kayıtlar bozulmaz — sadece eskisi gibi tam boy iner.
-- Bu yüzden kolon bilerek nullable ve backfill gerektirmiyor.
-- ─────────────────────────────────────────────

alter table public.photos
  add column if not exists thumb_path text;

comment on column public.photos.thumb_path is
  'Izgaralarda kullanılan küçük kopyanın storage yolu. NULL ise storage_path kullanılır.';
