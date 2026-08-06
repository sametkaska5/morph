-- ─────────────────────────────────────────────
-- 0012'DEKİ ÇALIŞMA ANI HATASININ DÜZELTMESİ
--
-- 0012, `search_path = ''` kullandığı için tüm referansları şema adıyla yazdı.
-- Ama COALESCE ve NULLIF PostgreSQL'de FONKSİYON DEĞİL, dil yapısı (SQL
-- construct): parser tarafından çözülüyorlar, pg_catalog'da böyle bir fonksiyon
-- yok. `pg_catalog.nullif(...)` çağrısı bu yüzden şu hatayı veriyordu:
--
--   ERROR: function pg_catalog.nullif(text, unknown) does not exist
--
-- Niteleme zaten GEREKMİYOR: bu yapılar şema aramasından geçmediği için
-- search_path manipülasyonuyla ele geçirilemiyorlar. Niteliksiz hâlleri hem
-- doğru hem güvenli. Aynı şey CASE, GREATEST, LEAST için de geçerli.
--
-- Hata neden 0012 uygulanırken çıkmadı: PL/pgSQL gövdesi fonksiyon
-- oluşturulurken derinlemesine denetlenmiyor, ifadeler ÇALIŞMA ANINDA
-- çözülüyor. `create or replace` sorunsuz geçti, fonksiyon ilk çağrıldığında
-- patladı. Şema doğrulaması (tablo var mı, dil plpgsql mi) bunu yakalayamaz —
-- ancak fonksiyonu gerçekten çağırmak yakalar.
--
-- 0012 bilerek DEĞİŞTİRİLMEDİ: uygulanmış bir migration'ın içeriği yeniden
-- yazılmaz, düzeltme yeni bir migration olarak gelir. Sıfırdan kurulan bir
-- veritabanında 0012 bozuk fonksiyonu oluşturur, hemen ardından bu migration
-- düzgününü yerine koyar — net sonuç doğru.
--
-- Fonksiyonun geri kalanı 0012'deki gibi; gerekçeler orada yazılı.
-- ─────────────────────────────────────────────

create or replace function public.email_exists(check_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_limit constant integer := 10;
  c_window constant interval := interval '10 minutes';

  v_headers json;
  v_xff text;
  v_parts text[];
  v_key text;
  v_attempts integer;
begin
  v_headers := nullif(current_setting('request.headers', true), '')::json;

  -- Cloudflare'in eklediği başlık güvenilir. X-Forwarded-For'da EN SAĞDAKİ
  -- değer alınıyor: soldakiler istemci tarafından uydurulabilir ve her istekte
  -- farklı sahte IP yazarak sınır sonsuza kadar atlatılabilirdi.
  v_xff := v_headers ->> 'x-forwarded-for';
  v_parts := pg_catalog.string_to_array(v_xff, ',');

  -- coalesce/nullif BİLEREK niteliksiz — dil yapıları, nitelenemezler
  -- (bkz. yukarıdaki açıklama). Bu, 0012'deki hatanın tam olarak düzeltmesi.
  v_key := coalesce(
    nullif(pg_catalog.btrim(v_headers ->> 'cf-connecting-ip'), ''),
    nullif(pg_catalog.btrim(v_parts[pg_catalog.array_length(v_parts, 1)]), ''),
    'unknown'
  );

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

  if pg_catalog.random() < 0.01 then
    delete from public.email_lookup_throttle
    where window_started_at < pg_catalog.now() - interval '1 day';
  end if;

  if v_attempts > c_limit then
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
