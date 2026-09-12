-- ─────────────────────────────────────────────
-- STORAGE BUCKET (DOSYA YÜKLEME) GÜVENLİK SINIRLARI
--
-- Sunucu tarafında (Supabase Storage) 'photos' kovası için
-- dosya boyutu ve MIME türü kısıtlamalarını ekler.
-- ─────────────────────────────────────────────

-- 'photos' kovasının (bucket) ayarlarını güncelleyerek sunucu tarafı kısıtlamalarını ekliyoruz.
update storage.buckets
set 
  -- Maksimum 5 MB (5 * 1024 * 1024) sınır koyuyoruz.
  -- İstemcideki (React Native) resize/compress işlemleri bypass edilse bile sunucu 5 MB üstünü reddeder.
  file_size_limit = 5242880, 
  
  -- Sadece güvenli görsel formatlarına izin veriyoruz (gerçek MIME type kontrolü).
  -- Saldırgan .exe veya zararlı bir dosyayı yükleyemez.
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id = 'photos';
