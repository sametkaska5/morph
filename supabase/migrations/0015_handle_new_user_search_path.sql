-- ─────────────────────────────────────────────
-- handle_new_user'ın search_path'i sabitleniyor
--
-- 0002_auth_trigger.sql'deki fonksiyon `security definer`, yani çağıranın
-- değil SAHİBİNİN (postgres, süper kullanıcı) yetkisiyle çalışıyor. Bu gerekli:
-- normal bir rol auth.users tetikleyicisinden public tablolarına yazamaz.
--
-- Bedeli şu: fonksiyon çalışırken arama yolu (search_path) hâlâ ÇAĞIRANIN
-- kontrolünde. Nitelenmemiş bir referans (`profiles` gibi) çağıranın kendi
-- şemasındaki sahte bir tabloya düşürülebilir ve o kod süper kullanıcı
-- yetkisiyle çalışırdı. Buna "search_path hijacking" deniyor.
--
-- Bu fonksiyonda somut bir açık yok — gövdedeki iki referans da zaten şema
-- adıyla yazılı. Ama savunma tek bir gözden kaçmaya bağlı kalmasın diye arama
-- yolunu boşaltıyoruz; email_exists (0012) ve delete_own_account (0008) zaten
-- bu kuralı izliyordu, kural dışında kalan tek fonksiyon buydu.
--
-- search_path = '' güvenli: pg_catalog her zaman örtük olarak aranır, o yüzden
-- `->>` operatörü gibi dil unsurları çalışmaya devam eder; şema adıyla
-- yazılmış referanslar da zaten arama yoluna ihtiyaç duymaz.
--
-- Tetikleyiciyi yeniden oluşturmaya gerek yok: `create or replace` fonksiyonun
-- kimliğini koruduğu için on_auth_user_created bağlı kalmaya devam ediyor.
-- ─────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, new.raw_user_meta_data->>'name');

  insert into public.notification_settings (user_id)
  values (new.id);

  return new;
end;
$$;
