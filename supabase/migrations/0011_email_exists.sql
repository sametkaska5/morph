-- ─────────────────────────────────────────────
-- GİRİŞ EKRANINDAKİ BELİRSİZLİĞİ KALDIRAN KONTROL
--
-- Supabase, giriş başarısız olduğunda hesabın hiç olmamasıyla şifrenin yanlış
-- olmasını AYIRMADAN aynı hatayı döndürüyor ("Invalid login credentials").
-- Bu, kullanıcı sayımını (user enumeration) engellemek için bilinçli bir
-- davranış. Sonucu ise kullanıcının "e-postamı mı yanlış yazdım, şifremi mi"
-- diye takılıp kalması.
--
-- Bu fonksiyon o belirsizliği kaldırıyor. Karşılığında, bu uygulamada bir
-- e-postanın kayıtlı olup olmadığı anon anahtarla sorgulanabilir hâle geliyor
-- — anon anahtar uygulama paketinin içinde olduğu için pratikte herkese açık.
-- Bilinçli bir denge: bir anı defteri için sızan bilgi "bu adres burada
-- kayıtlı" ile sınırlı, kazanç ise kullanıcının kilitlenmemesi.
--
-- Güvenlik notları:
--  - YALNIZCA boolean döner; e-posta listesi, kimlik ya da başka hiçbir alan
--    dışarı çıkmaz.
--  - security definer + boş search_path: fonksiyon auth.users'ı okuyabilsin
--    ama arama yolu manipülasyonuyla başka bir şeye yönlendirilemesin.
--  - public rolünden yetki alınıp yalnızca anon/authenticated'a veriliyor.
-- ─────────────────────────────────────────────

create or replace function public.email_exists(check_email text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from auth.users
    where lower(email) = lower(trim(check_email))
  );
$$;

comment on function public.email_exists(text) is
  'Giriş ekranı için: verilen e-postayla bir hesap var mı. Yalnızca boolean döner.';

revoke all on function public.email_exists(text) from public;
grant execute on function public.email_exists(text) to anon, authenticated;
