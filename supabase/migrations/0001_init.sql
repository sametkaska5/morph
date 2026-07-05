-- Remory · ilk şema
-- Sohbette çıkardığımız ERD'nin birebir karşılığı.

create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- USERS (Supabase auth.users'ı genişletir)
-- ─────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  unit_pref text not null default 'metric' check (unit_pref in ('metric', 'imperial')),
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- MEASUREMENT_TYPES
-- Sistem varsayılanları (user_id null) + kullanıcı özel ölçümleri
-- target_direction: akıllı renklendirme kararımız burada karşılık buluyor
-- ─────────────────────────────────────────────
create table public.measurement_types (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade, -- null = sistem varsayılanı
  name text not null,
  unit text not null,
  target_direction text not null default 'decrease_is_good'
    check (target_direction in ('decrease_is_good', 'increase_is_good')),
  is_default boolean not null default false,
  sort_order int not null default 0
);

-- Varsayılan sistem ölçümleri (her kullanıcıda hazır gelir)
insert into public.measurement_types (name, unit, target_direction, is_default, sort_order) values
  ('kilo', 'kg', 'decrease_is_good', true, 1),
  ('bel', 'cm', 'decrease_is_good', true, 2),
  ('göğüs', 'cm', 'increase_is_good', true, 3),
  ('vücut yağ oranı', '%', 'decrease_is_good', true, 4);

-- ─────────────────────────────────────────────
-- ENTRIES
-- type: 'log' (fotoğraf/ölçüm/not içerebilir) | 'off_day'
-- Kullanıcı başına günde tek entry (unique index)
-- ─────────────────────────────────────────────
create table public.entries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  type text not null default 'log' check (type in ('log', 'off_day')),
  note text,
  cover_photo_id uuid, -- aşağıda photos oluşunca FK ekleniyor
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

-- ─────────────────────────────────────────────
-- PHOTOS
-- Bir entry'nin birden fazla fotoğrafı olabilir; kapak entries.cover_photo_id ile seçilir
-- ─────────────────────────────────────────────
create table public.photos (
  id uuid primary key default uuid_generate_v4(),
  entry_id uuid not null references public.entries(id) on delete cascade,
  storage_path text not null, -- Supabase Storage içindeki yol
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.entries
  add constraint entries_cover_photo_fk
  foreign key (cover_photo_id) references public.photos(id) on delete set null;

-- ─────────────────────────────────────────────
-- MEASUREMENT_VALUES
-- Bir entry + bir ölçüm türü = tek değer
-- ─────────────────────────────────────────────
create table public.measurement_values (
  id uuid primary key default uuid_generate_v4(),
  entry_id uuid not null references public.entries(id) on delete cascade,
  measurement_type_id uuid not null references public.measurement_types(id),
  value numeric not null,
  unique (entry_id, measurement_type_id)
);

-- ─────────────────────────────────────────────
-- NOTIFICATION_SETTINGS
-- Basit ayar ekranındaki 3 toggle + 2 saat alanı
-- ─────────────────────────────────────────────
create table public.notification_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  past_memory_enabled boolean not null default true,
  streak_enabled boolean not null default true,
  daily_reminder_enabled boolean not null default true,
  reminder_time time not null default '20:00',
  quiet_start time not null default '23:00',
  quiet_end time not null default '07:00'
);

-- ─────────────────────────────────────────────
-- INDEXLER
-- ─────────────────────────────────────────────
create index entries_user_date_idx on public.entries (user_id, date desc);
create index photos_entry_idx on public.photos (entry_id, order_index);
create index measurement_values_entry_idx on public.measurement_values (entry_id);

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- Herkes sadece kendi verisini görür/değiştirir
-- ─────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.entries enable row level security;
alter table public.photos enable row level security;
alter table public.measurement_types enable row level security;
alter table public.measurement_values enable row level security;
alter table public.notification_settings enable row level security;

create policy "kendi profilini gör/düzenle" on public.profiles
  for all using (auth.uid() = id);

create policy "kendi kayıtların" on public.entries
  for all using (auth.uid() = user_id);

create policy "kendi fotoğrafların" on public.photos
  for all using (
    auth.uid() = (select user_id from public.entries where id = entry_id)
  );

create policy "sistem ölçümleri herkese açık, özel ölçümler sahibine" on public.measurement_types
  for select using (user_id is null or auth.uid() = user_id);

create policy "özel ölçüm ekleme/silme sahibine özel" on public.measurement_types
  for insert with check (auth.uid() = user_id);

create policy "özel ölçüm güncelleme/silme sahibine özel" on public.measurement_types
  for update using (auth.uid() = user_id);

create policy "kendi ölçüm değerlerin" on public.measurement_values
  for all using (
    auth.uid() = (select user_id from public.entries where id = entry_id)
  );

create policy "kendi bildirim ayarların" on public.notification_settings
  for all using (auth.uid() = user_id);
