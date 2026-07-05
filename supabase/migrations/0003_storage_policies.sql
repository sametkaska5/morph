-- "photos" bucket'ı için storage.objects politikaları
-- Yol yapısı: {user_id}/{entry_id}/{dosya}.jpg
-- Herkes sadece kendi user_id klasörüne yükleyebilir/okuyabilir

create policy "kendi fotoğraflarını yükle"
  on storage.objects for insert
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "kendi fotoğraflarını görüntüle"
  on storage.objects for select
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "kendi fotoğraflarını sil"
  on storage.objects for delete
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
