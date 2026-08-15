-- delete_own_account fonksiyonunun search_path güvenliğini email_exists ile
-- tutarlı hale getirir.
--
-- 0008'deki orijinal tanımda `set search_path = public, auth` kullanılıyordu.
-- security definer fonksiyonlarda dolu bir search_path, kötü niyetli bir
-- kullanıcının aynı isimde sahte nesneler (fonksiyon, tablo) tanımlayıp
-- fonksiyonu o nesnelere yönlendirmesine kapı aralıyor (search_path hijacking).
--
-- Çözüm: email_exists ve email_exists_rate_limit ile aynı yaklaşım —
-- search_path tamamen boşaltılıp tüm referanslar şema adıyla yazılıyor.
-- Fonksiyonun mantığı değişmiyor; yalnızca güvenlik niteliği güçleniyor.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;
