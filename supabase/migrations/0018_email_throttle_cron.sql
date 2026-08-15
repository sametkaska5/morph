-- email_lookup_throttle için pg_cron ile günlük temizlik.
--
-- ARKA PLAN:
-- 0012_email_exists_rate_limit.sql olasılıklı temizlik kullanıyor:
--   if random() < 0.01 then delete ... where window_started_at < now() - '1 day'
-- Bu yüzde 1 ihtimalle çalışıyor. Yoğun dönemlerde tablo gereksiz yere
-- büyüyebiliyor; sessiz dönemlerde hiç çalışmayabiliyor.
--
-- PG_CRON:
-- Supabase Pro ve üzeri planlarda pg_cron varsayılan olarak kurulu gelir.
-- Free planda eksik olabilir. Bu migration her iki durumu da ele alır:
--   - Extension varsa: cron job kurar, olasılıklı temizliği devre dışı bırakır.
--   - Extension yoksa: NOTICE yazar, olasılıklı temizlik eskisi gibi çalışmaya
--     devam eder — migration başarısız OLMAZ.
--
-- ÇALIŞTIRMADANÖNCEkontrol:
--   SELECT * FROM pg_available_extensions WHERE name = 'pg_cron';
-- "installed_version" doluysa aktif demektir.

do $$
begin
  -- Extension yoksa sessizce atla; migration başarısız olmasın.
  if not exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) then
    raise notice
      '[0018] pg_cron extension bulunamadı. '
      'email_lookup_throttle temizliği olasılıklı yöntemle devam edecek. '
      'Pro plana geçilirse bu migration''ı yeniden çalıştır.';
    return;
  end if;

  -- Günlük gece yarısı (UTC) temizlik: bir günden eski throttle satırlarını sil.
  -- Saat 00:05 seçildi — Supabase''in kendi bakım penceresi genelde 00:00-00:05
  -- arasında, küçük bir ofset çakışmayı önlüyor.
  perform cron.schedule(
    'email-throttle-daily-cleanup',   -- job adı (uniq, idempotent)
    '5 0 * * *',                       -- her gün 00:05 UTC
    $$
      delete from public.email_lookup_throttle
      where window_started_at < now() - interval '1 day';
    $$
  );

  -- Olasılıklı temizliği email_exists fonksiyonundan çıkarmak artık
  -- güvenli — düzenli job onu devre aldı. Fonksiyonu güncelliyoruz:
  -- rastgele silme kodu kaldırıldı, her şey aynı kalıyor.
  create or replace function public.email_exists(check_email text)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
  as $fn$
  declare
    c_limit   constant integer  := 10;
    c_window  constant interval := interval '10 minutes';

    v_headers  json;
    v_xff      text;
    v_parts    text[];
    v_key      text;
    v_attempts integer;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;

    v_xff   := v_headers ->> 'x-forwarded-for';
    v_parts := pg_catalog.string_to_array(v_xff, ',');

    v_key := pg_catalog.coalesce(
      pg_catalog.nullif(pg_catalog.btrim(v_headers ->> 'cf-connecting-ip'), ''),
      pg_catalog.nullif(
        pg_catalog.btrim(v_parts[pg_catalog.array_length(v_parts, 1)]),
        ''
      ),
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

    -- Olasılıklı temizlik KALDIRILDI: artık cron job yapıyor (bkz. 0018).

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
  $fn$;

  raise notice '[0018] pg_cron job "email-throttle-daily-cleanup" kuruldu.';

end;
$$;
