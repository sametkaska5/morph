-- email_lookup_throttle için pg_cron ile günlük temizlik.
--
-- 0012_email_exists_rate_limit.sql olasılıklı temizlik kullanıyor (random() < 0.01).
-- pg_cron varsa (Supabase Pro+) günlük deterministik temizlik ekliyoruz.
-- pg_cron yoksa (Free plan) migration sessizce geçer — olasılıklı yöntem devam eder.
--
-- KONTROL: Supabase Dashboard → SQL Editor'de çalıştır:
--   SELECT * FROM pg_available_extensions WHERE name = 'pg_cron';

do $outer$
begin
  if not exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) then
    raise notice
      '[0018] pg_cron bulunamadı — email_lookup_throttle temizliği '
      'olasılıklı yöntemle devam ediyor. Pro plana geçilirse bu '
      'migration''ı yeniden çalıştır.';
    return;
  end if;

  -- Her gün 00:05 UTC — Supabase bakım penceresi (00:00-00:05) bittikten hemen sonra.
  -- Tek tırnak içindeki interval için '' ile escape ediyoruz.
  perform cron.schedule(
    'email-throttle-daily-cleanup',
    '5 0 * * *',
    'delete from public.email_lookup_throttle
     where window_started_at < now() - interval ''1 day'''
  );

  raise notice '[0018] pg_cron job "email-throttle-daily-cleanup" kuruldu.';
end;
$outer$;
