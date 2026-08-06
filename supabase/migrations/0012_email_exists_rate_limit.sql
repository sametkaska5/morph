-- ─────────────────────────────────────────────
-- email_exists İÇİN HIZ SINIRI
--
-- 0011 bilinçli bir denge kurmuştu: giriş ekranındaki "hesabım mı yok, şifrem mi
-- yanlış" belirsizliğini kaldırmak için bir e-postanın kayıtlı olup olmadığını
-- sorulabilir hâle getirdik. Kabul edilen sızıntı TEK bir e-posta hakkında tek
-- bir boolean'dı.
--
-- Sınırsız bırakıldığında bu denge bozuluyor: anon anahtar uygulama paketinin
-- içinde, yani pratikte herkeste. Elinde e-posta listesi olan biri fonksiyonu
-- döngüye sokup "bu listeden kimler Remory kullanıyor" sorusunu toplu olarak
-- cevaplayabilir. Tek tek sızan bilgi zararsız, TOPLU sızan bilgi bir kullanıcı
-- listesi.
--
-- Çözüm, çağrıyı çağıran IP'si başına saymak. Sınır aşıldığında fonksiyon hata
-- fırlatıyor; istemci (lib/accountLookup.ts) bunu "unknown" olarak ele alıp
-- eski genel mesaja düşüyor — yani meşru kullanıcı için en kötü sonuç, ayrımın
-- olmadığı ESKİ davranış. Bu yüzden sınırı cömert tutmaya gerek yok.
-- ─────────────────────────────────────────────

create table if not exists public.email_lookup_throttle (
  -- Çağıranın IP'si. Ham tutuluyor ama uzun ömürlü değil: aşağıdaki süpürme
  -- bir günden eski satırları siliyor, yani saklama süresi tipik log
  -- saklamasından kısa.
  client_key text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0
);

-- Tabloya doğrudan erişim YOK. RLS açık ve hiçbir policy tanımlı değil, yani
-- anon/authenticated hiçbir satırı göremez veya yazamaz; yalnızca aşağıdaki
-- security definer fonksiyon üzerinden değişiyor. Politika yazmayı unuttuğumuz
-- için değil, bilerek: bu tablo bir sayaç, kullanıcı verisi değil.
alter table public.email_lookup_throttle enable row level security;

revoke all on table public.email_lookup_throttle from public, anon, authenticated;

comment on table public.email_lookup_throttle is
  'public.email_exists için IP başına çağrı sayacı. Yalnızca o fonksiyon yazar.';

create or replace function public.email_exists(check_email text)
returns boolean
language plpgsql
security definer
-- Boş search_path: fonksiyon auth.users'ı okuyabilsin ama arama yolu
-- manipülasyonuyla başka bir şeye yönlendirilemesin. Bu yüzden aşağıdaki TÜM
-- referanslar şema adıyla yazılı.
set search_path = ''
as $$
declare
  -- 10 dakikada 10 çağrı. Meşru akış giriş BAŞARISIZ olduktan sonra tek bir
  -- çağrı yapıyor; bu sınır normal kullanımın kat kat üstünde. Taşıyıcı NAT'ı
  -- ardındaki kullanıcılar aynı IP'yi paylaşabilir, ama sınırı aşmanın bedeli
  -- yalnızca genel mesaja düşmek olduğu için kabul edilebilir.
  c_limit constant integer := 10;
  c_window constant interval := interval '10 minutes';

  v_headers json;
  v_xff text;
  v_parts text[];
  v_key text;
  v_attempts integer;
begin
  -- request.headers yalnızca PostgREST üzerinden gelen çağrılarda dolu; SQL
  -- editöründen çağrıldığında NULL oluyor, o yüzden `true` (missing_ok).
  v_headers := nullif(current_setting('request.headers', true), '')::json;

  -- Cloudflare'in eklediği başlık güvenilir: istemci gönderse bile üzerine
  -- yazılıyor. X-Forwarded-For'da ise EN SAĞDAKİ değeri alıyoruz — soldaki
  -- değerler istemci tarafından uydurulabilir ve her istekte farklı bir sahte
  -- IP yazarak sınır sonsuza kadar atlatılabilirdi.
  v_xff := v_headers ->> 'x-forwarded-for';
  v_parts := pg_catalog.string_to_array(v_xff, ',');

  v_key := pg_catalog.coalesce(
    pg_catalog.nullif(pg_catalog.btrim(v_headers ->> 'cf-connecting-ip'), ''),
    pg_catalog.nullif(
      pg_catalog.btrim(v_parts[pg_catalog.array_length(v_parts, 1)]),
      ''
    ),
    'unknown'
  );

  -- Pencere dolduysa sayaç sıfırlanıp yeniden başlıyor; dolmadıysa artıyor.
  insert into public.email_lookup_throttle as t (client_key, window_started_at, attempts)
  values (v_key, pg_catalog.now(), 1)
  on conflict (client_key) do update
    set attempts = case
          when t.window_started_at < pg_catalog.now() - c_window then 1
          else t.attempts + 1
        end,
        window_started_at = case
          when t.window_started_at < pg_catalog.now() - c_window then pg_catalog.now()
          else t.window_started_at
        end
  returning t.attempts into v_attempts;

  -- Sayaç tablosunu sınırlı tutan ve IP saklama süresini kısaltan süpürme.
  -- Ayrı bir zamanlanmış işe (pg_cron) bağlamamak için olasılıklı: yüz çağrıda
  -- bir çalışıyor, ki bu tabloyu büyümeden tutmaya fazlasıyla yetiyor.
  if pg_catalog.random() < 0.01 then
    delete from public.email_lookup_throttle
    where window_started_at < pg_catalog.now() - interval '1 day';
  end if;

  if v_attempts > c_limit then
    -- İstemci bunu "unknown" olarak ele alıp genel mesaja düşüyor
    -- (bkz. lib/accountLookup.ts) — kullanıcıya ham hata gösterilmiyor.
    raise exception 'email_exists rate limit exceeded'
      using errcode = 'P0001', hint = 'Too many lookups from this address.';
  end if;

  return exists (
    select 1
    from auth.users
    where pg_catalog.lower(email) = pg_catalog.lower(pg_catalog.btrim(check_email))
  );
end;
$$;

comment on function public.email_exists(text) is
  'Giriş ekranı için: verilen e-postayla bir hesap var mı. Yalnızca boolean döner. IP başına 10 dakikada 10 çağrıyla sınırlı.';

revoke all on function public.email_exists(text) from public;
grant execute on function public.email_exists(text) to anon, authenticated;
