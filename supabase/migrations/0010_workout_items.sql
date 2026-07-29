-- Yapılandırılmış antrenman programı: hareket + SET SET (her set kendi tekrar/
-- ağırlığını tutar). Gerçekte her set farklı tekrar/ağırlık olabildiği için
-- (örn. 60x8, 65x6, 70x4) hareketi ve setlerini iki ayrı tabloya ayırdık.
--
-- Not: bu dosyanın ilk taslağı tek tabloydu (workout_items içinde sets/reps/weight).
-- Özellik henüz canlıda olmadığından o tabloyu düşürüp yeni yapıyı kuruyoruz;
-- eski taslağı Supabase'te çalıştırdıysan da bu SQL güvenle üzerine geçer.

drop table if exists public.workout_items cascade;

-- Bir gün (entry) için hareketler. Kullanıcının girdiği sıra order_index ile korunur.
create table public.workout_items (
  id uuid primary key default uuid_generate_v4(),
  entry_id uuid not null references public.entries(id) on delete cascade,
  name text not null,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

-- Bir hareketin setleri. reps/weight NULL olabilir (sadece hareketi işaretleyip
-- ayrıntıyı boş bırakmak — örn. kardiyo/esneme).
create table public.workout_sets (
  id uuid primary key default uuid_generate_v4(),
  workout_item_id uuid not null references public.workout_items(id) on delete cascade,
  reps int,
  weight numeric,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create index workout_items_entry_idx on public.workout_items (entry_id, order_index);
create index workout_sets_item_idx on public.workout_sets (workout_item_id, order_index);

alter table public.workout_items enable row level security;
alter table public.workout_sets enable row level security;

-- Hareketin sahibi, bağlı olduğu entry'nin sahibidir (measurement_values deseni).
create policy "kendi program hareketlerin" on public.workout_items
  for all using (
    auth.uid() = (select user_id from public.entries where id = entry_id)
  );

-- Setin sahibi: set -> item -> entry -> user zincirinden çözülür.
create policy "kendi program setlerin" on public.workout_sets
  for all using (
    auth.uid() = (
      select e.user_id
      from public.workout_items wi
      join public.entries e on e.id = wi.entry_id
      where wi.id = workout_item_id
    )
  );
