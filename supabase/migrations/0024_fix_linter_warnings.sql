-- Fix "Function Search Path Mutable" for search_entries
create or replace function public.search_entries(search_term text)
returns setof public.entries
language sql
security invoker
set search_path = ''
as $$
  select *
  from public.entries
  where type = 'log'
    and pg_catalog.to_tsvector('simple', coalesce(note, '')) @@ pg_catalog.plainto_tsquery('simple', search_term)
  order by date desc;
$$;

-- Fix "Public Can Execute SECURITY DEFINER Function" for handle_new_user
-- Trigger functions only need to be executed by the database itself, not by users.
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon, authenticated;

-- Ensure delete_own_account is not executable by anon (only authenticated)
revoke all on function public.delete_own_account() from public;
revoke all on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;
