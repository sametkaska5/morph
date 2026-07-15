-- Profil fotoğrafı için storage'daki yolu tutar (photos bucket'ında
-- {user_id}/avatar/{dosya}.jpg altında saklanır — mevcut storage politikaları
-- (0003_storage_policies.sql) sadece ilk klasörün user_id olmasını şart koştuğu
-- için ek bir politika gerekmiyor).
alter table public.profiles add column avatar_path text;
