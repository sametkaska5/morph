-- Full-Text Search (FTS) altyapısı ve RPC fonksiyonu

-- 1. Arama performansını artırmak için GIN indeksi
create index if not exists entries_note_fts_idx on public.entries using gin (to_tsvector('simple', coalesce(note, '')));

-- 2. İstemciden çağrılacak RPC fonksiyonu
-- 'security invoker' sayesinde RLS kuralları otomatik işletilir, 
-- her kullanıcı sadece kendi notlarında arama yapabilir.
create or replace function public.search_entries(search_term text)
returns setof public.entries
language sql
security invoker
as $$
  select *
  from public.entries
  where type = 'log'
    and to_tsvector('simple', coalesce(note, '')) @@ plainto_tsquery('simple', search_term)
  order by date desc;
$$;
