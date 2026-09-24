-- entries.note ve workout_items.name için uzunluk kısıtı.
--
-- SORUN: `note` kolonu sınırsız `text` tipindeydi. RLS kullanıcının kendi
-- satırlarına erişimini sınırlıyor ama kaç bayt yazabileceğini sınırlamıyor.
-- Anon key uygulama paketinin içinde (EXPO_PUBLIC_*), yani payload boyutunu
-- istemci doğrulamasına bırakmak yeterli değil — client bypass edilebilir.
--
-- SINIRLAR:
--   note          : 5 000 karakter — tipik bir günlük notunun çok üstünde,
--                   meşru kullanımı kısıtlamaz.
--   workout_items.name: 200 karakter — egzersiz adı için fazlasıyla geniş.
--
-- NOT: Mevcut satırlarda bu sınırı aşan veri varsa migration başarısız olur.
-- Temiz bir DB'de (sıfırdan kurulum / staging / felaket kurtarma) sorun yok.
-- Canlı veritabanında uygulamadan önce:
--   SELECT id, char_length(note) FROM entries WHERE char_length(note) > 5000;
-- sorgusuyla kontrol et; satır yoksa doğrudan uygulayabilirsin.

alter table public.entries
  add constraint entries_note_length
    check (note is null or char_length(note) <= 5000);

alter table public.workout_items
  add constraint workout_items_name_length
    check (char_length(name) <= 200);
