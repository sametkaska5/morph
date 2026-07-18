-- Kullanıcının kendi hesabını silebilmesi için RPC. Normal bir authenticated
-- rol auth.users tablosuna doğrudan erişemez (auth şeması RLS ile kapalı); bu
-- fonksiyon security definer olarak migration'ı çalıştıran rolün (postgres)
-- yetkisiyle çalışıp SADECE çağıranın kendi auth.uid()'sine ait satırı siliyor.
-- profiles/entries/photos/measurement_values/notification_settings hepsi
-- auth.users(id)'e "on delete cascade" ile bağlı (bkz. 0001_init.sql) — tek
-- silme burada tüm zinciri temizliyor. Storage'daki fotoğraf dosyaları bu
-- cascade'e dahil değil, onlar client tarafında ayrıca temizleniyor
-- (bkz. lib/storage.ts deleteAllUserPhotos).
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
