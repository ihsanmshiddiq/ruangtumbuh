-- ============================================================================
-- RUANG TUMBUH — Supabase production schema (PostgreSQL)
-- ============================================================================
-- File ini adalah mirror 1:1 dari prisma/schema.prisma (Fase 1-6) untuk
-- deployment produksi yang sesungguhnya: Supabase (Postgres + Auth + RLS).
--
-- CARA PAKAI:
--   Jalankan SELURUH file ini SEKALI di Supabase Dashboard -> SQL Editor.
--   (Fungsi/trigger memakai CREATE OR REPLACE, tetapi CREATE TABLE sengaja
--    tanpa IF NOT EXISTS agar salah nama tabel/kolom langsung terlihat.)
--
-- PRINSIP YANG DIPEGANG KERAS:
--   1. TIDAK ADA kolom password di schema ini. Kredensial dipegang penuh oleh
--      Supabase Auth (tabel auth.users milik Supabase — tidak kita sentuh).
--   2. Semua primary key: uuid + gen_random_uuid().
--   3. Semua timestamp: timestamptz dengan default now().
--   4. Uang SELALU integer rupiah (tidak pernah float).
--   5. SEMUA tabel diaktifkan Row Level Security (RLS). Rantai otorisasi:
--         auth.uid() -> workspace_members(user_id) -> workspace_id -> baris.
--      Frontend TIDAK PERNAH dipercaya; kebijakan di bawah yang menegakkan.
--   6. Semua kolom user (user_id / created_by / sender_id) merujuk ke
--      auth.users(id) ON DELETE CASCADE — menghapus user di dashboard otomatis
--      membersihkan jejak datanya.
-- ============================================================================

-- ─── 0. Ekstensi ──────────────────────────────────────────────────────────
-- gen_random_uuid() sudah bawaan PostgreSQL 13+, tapi pgcrypto dijamin aktif.
create extension if not exists pgcrypto;

-- ─── 1. Fungsi bantu (dipakai oleh CHECK constraint) ──────────────────────
-- preferred_days adalah jsonb berupa ARRAY berisi integer 0..6
-- (0 = Minggu .. 6 = Sabtu). Array kosong '[]' artinya fleksibel (hari apa pun).
-- CHECK constraint tidak boleh berisi subquery, jadi validasi dibungkus fungsi
-- IMMUTABLE ini.
create or replace function public.is_valid_preferred_days(days jsonb)
returns boolean
language sql
immutable
as $$
  select case
    when coalesce(jsonb_typeof(days), '') <> 'array' then false
    else not exists (
      select 1
      from jsonb_array_elements(days) as d(day)
      where jsonb_typeof(d.day) <> 'number'
         or d.day::text !~ '^[0-6]$'
    )
  end;
$$;

-- ─── 2. Tabel ─────────────────────────────────────────────────────────────

-- ── profiles ──────────────────────────────────────────────────────────────
-- Profil tampilan (nama + avatar). Email dan kredensial TIDAK di sini:
-- semuanya hidup di auth.users milik Supabase. Tidak ada kolom password,
-- tidak akan pernah ada. Baris dibuat otomatis oleh trigger on_auth_user_created
-- (lihat bagian 5) dan terhapus otomatis mengikuti auth.users.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── workspaces ────────────────────────────────────────────────────────────
-- Satu workspace = satu rumah. Untuk aplikasi ini: TEPAT SATU workspace,
-- dibuat manual lewat SQL Editor (lihat contoh di paling bawah file ini).
create table public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── workspace_members ─────────────────────────────────────────────────────
-- Jembatan user <-> workspace. Peran hanya dua: 'owner' dan 'partner'.
-- Keanggotaan dikelola lewat SQL Editor/dashboard saja — tidak ada kebijakan
-- INSERT/UPDATE/DELETE dari API (lihat bagian RLS).
create table public.workspace_members (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null check (role in ('owner', 'partner')),
  created_at   timestamptz not null default now(),
  constraint workspace_members_workspace_user_unique unique (workspace_id, user_id)
);
create index workspace_members_user_id_idx on public.workspace_members (user_id);

-- ── activities ────────────────────────────────────────────────────────────
-- Definisi aktivitas mingguan. weekly_target = berapa kali per minggu.
-- preferred_start_time / preferred_end_time: teks 'HH:MM' (boleh NULL).
-- preferred_days: jsonb array int 0..6; '[]' = fleksibel (hari apa pun).
create table public.activities (
  id                         uuid primary key default gen_random_uuid(),
  workspace_id               uuid not null references public.workspaces (id) on delete cascade,
  created_by                 uuid not null references auth.users (id) on delete cascade,
  name                       text not null,
  description                text not null default '',
  weekly_target              integer not null default 1 check (weekly_target >= 1),
  estimated_duration_minutes integer,
  preferred_start_time       text check (preferred_start_time is null or preferred_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  preferred_end_time         text check (preferred_end_time is null or preferred_end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  preferred_days             jsonb not null default '[]'::jsonb check (public.is_valid_preferred_days(preferred_days)),
  active                     boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
create index activities_workspace_id_idx on public.activities (workspace_id);

-- ── activity_logs ─────────────────────────────────────────────────────────
-- Gabungan rencana + realisasi: satu entri per (aktivitas, orang, tanggal).
-- status: planned | done | skipped | rescheduled.
-- rescheduled_from = tanggal asal, saat aktivitas digeser (riwayat dipertahankan).
create table public.activity_logs (
  id                       uuid primary key default gen_random_uuid(),
  workspace_id             uuid not null references public.workspaces (id) on delete cascade,
  activity_id              uuid not null references public.activities (id) on delete cascade,
  user_id                  uuid not null references auth.users (id) on delete cascade,
  date                     date not null,
  status                   text not null default 'planned' check (status in ('planned', 'done', 'skipped', 'rescheduled')),
  planned_duration_minutes integer,
  actual_duration_minutes  integer,
  note                     text not null default '',
  rescheduled_from         date,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint activity_logs_activity_user_date_unique unique (activity_id, user_id, date)
);
create index activity_logs_workspace_date_idx on public.activity_logs (workspace_id, date);

-- ── weekly_plan_entries ───────────────────────────────────────────────────
-- Entri rencana mingguan per aktivitas per orang per tanggal.
create table public.weekly_plan_entries (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  activity_id        uuid not null references public.activities (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  date               date not null,
  planned_start_time text check (planned_start_time is null or planned_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  planned_end_time   text check (planned_end_time is null or planned_end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  status             text not null default 'planned' check (status in ('planned', 'done', 'skipped', 'rescheduled')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint weekly_plan_entries_activity_user_date_unique unique (activity_id, user_id, date)
);
create index weekly_plan_entries_workspace_date_idx on public.weekly_plan_entries (workspace_id, date);

-- ── energy_logs ───────────────────────────────────────────────────────────
-- Level energi harian: 1 rendah | 2 sedang | 3 tinggi. Satu baris per hari.
create table public.energy_logs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  date         date not null,
  level        integer not null check (level between 1 and 3),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint energy_logs_user_date_unique unique (user_id, date)
);
create index energy_logs_workspace_date_idx on public.energy_logs (workspace_id, date);

-- ── weekly_reflections ────────────────────────────────────────────────────
-- Refleksi mingguan per orang. week_start SELALU hari Senin (dicek constraint).
-- Kelima field isi bebas, default string kosong (tidak ada guilt, tidak wajib).
create table public.weekly_reflections (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  week_start      date not null check (extract(isodow from week_start) = 1), -- Senin
  worked          text not null default '',
  blocked         text not null default '',
  next_adjustment text not null default '',
  weekly_sentence text not null default '',
  gratitude       text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint weekly_reflections_user_week_unique unique (user_id, week_start)
);
create index weekly_reflections_workspace_week_idx on public.weekly_reflections (workspace_id, week_start);

-- ── comments ──────────────────────────────────────────────────────────────
-- Komentar generik pada entitas lain (saat ini: 'weekly_reflection',
-- 'activity_log'). entity_type sengaja TEXT agar daftar entitas boleh bertambah;
-- entity_id adalah uuid tabel target.
create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  entity_type  text not null, -- 'weekly_reflection' | 'activity_log' (bisa bertambah)
  entity_id    uuid not null,
  content      text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index comments_workspace_entity_idx on public.comments (workspace_id, entity_type, entity_id);

-- ── messages ──────────────────────────────────────────────────────────────
-- Chat pribadi dua orang. Hanya created_at (pesan tidak diedit/dihapus dari UI).
create table public.messages (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  sender_id    uuid not null references auth.users (id) on delete cascade,
  content      text not null,
  created_at   timestamptz not null default now()
);
create index messages_workspace_created_idx on public.messages (workspace_id, created_at);

-- ── transaction_categories ────────────────────────────────────────────────
-- Kategori uang. bucket mengikuti filosofi buku kas:
-- income | needs | wants | charity | savings | target.
-- monthly_target = 0 artinya tanpa target bulanan untuk kategori itu.
create table public.transaction_categories (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  name           text not null,
  type           text not null check (type in ('income', 'expense')),
  bucket         text not null check (bucket in ('income', 'needs', 'wants', 'charity', 'savings', 'target')),
  monthly_target integer not null default 0 check (monthly_target >= 0),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index transaction_categories_workspace_id_idx on public.transaction_categories (workspace_id);

-- ── transactions ──────────────────────────────────────────────────────────
-- Transaksi kas. amount SELALU integer rupiah dan > 0.
-- CATATAN FK category_id: memakai ON DELETE CASCADE — menghapus kategori
-- berarti ikut menghapus transaksinya. Untuk aplikasi ini itu diterima, dan
-- larangan "hapus kategori yang masih dipakai" ditegakkan di level aplikasi
-- (konfirmasi di UI). Jika suatu hari ingin menolak hapus, ganti ke
-- ON DELETE RESTRICT.
create table public.transactions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by   uuid not null references auth.users (id) on delete cascade,
  date         date not null,
  type         text not null check (type in ('income', 'expense')),
  category_id  uuid not null references public.transaction_categories (id) on delete cascade,
  amount       integer not null check (amount > 0), -- rupiah, selalu integer
  note         text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index transactions_workspace_date_idx on public.transactions (workspace_id, date);

-- ── allocation_plans ──────────────────────────────────────────────────────
-- Alokasi otomatis pemasukan. SATU baris per workspace (UNIQUE workspace_id).
-- Kelima persentase wajib berjumlah TEPAT 100 (constraint tingkat tabel).
-- Default 10/20/10/20/40.
-- TERPISAH dari "lensa interpretasi 50/30/20" — lensa itu dihitung runtime
-- dari bucket transaksi dan tidak butuh tabel.
create table public.allocation_plans (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null unique references public.workspaces (id) on delete cascade,
  needs_percent   integer not null default 10 check (needs_percent   >= 0),
  wants_percent   integer not null default 20 check (wants_percent   >= 0),
  charity_percent integer not null default 10 check (charity_percent >= 0),
  savings_percent integer not null default 20 check (savings_percent >= 0),
  target_percent  integer not null default 40 check (target_percent  >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint allocation_plans_total_100 check (
    needs_percent + wants_percent + charity_percent + savings_percent + target_percent = 100
  )
);
-- UNIQUE(workspace_id) di atas sudah membuat index unik — tidak perlu index tambahan.

-- ── financial_targets ─────────────────────────────────────────────────────
-- Dana target (mis. dana liburan). target_amount > 0, current_amount >= 0.
create table public.financial_targets (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  name           text not null,
  target_amount  integer not null check (target_amount > 0),
  current_amount integer not null default 0 check (current_amount >= 0),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index financial_targets_workspace_id_idx on public.financial_targets (workspace_id);

-- ─── 3. Trigger updated_at ────────────────────────────────────────────────
-- Mirror perilaku @updatedAt Prisma: setiap UPDATE menyentuh updated_at.
-- (messages dan workspace_members memang tidak punya updated_at di schema.)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at            before update on public.profiles            for each row execute function public.set_updated_at();
create trigger workspaces_set_updated_at          before update on public.workspaces          for each row execute function public.set_updated_at();
create trigger activities_set_updated_at          before update on public.activities          for each row execute function public.set_updated_at();
create trigger activity_logs_set_updated_at       before update on public.activity_logs       for each row execute function public.set_updated_at();
create trigger weekly_plan_entries_set_updated_at before update on public.weekly_plan_entries for each row execute function public.set_updated_at();
create trigger energy_logs_set_updated_at         before update on public.energy_logs         for each row execute function public.set_updated_at();
create trigger weekly_reflections_set_updated_at  before update on public.weekly_reflections  for each row execute function public.set_updated_at();
create trigger comments_set_updated_at            before update on public.comments            for each row execute function public.set_updated_at();
create trigger transactions_set_updated_at        before update on public.transactions        for each row execute function public.set_updated_at();
create trigger transaction_categories_set_updated_at before update on public.transaction_categories for each row execute function public.set_updated_at();
create trigger allocation_plans_set_updated_at    before update on public.allocation_plans    for each row execute function public.set_updated_at();
create trigger financial_targets_set_updated_at   before update on public.financial_targets   for each row execute function public.set_updated_at();

-- ─── 4. Trigger profil otomatis untuk user baru ───────────────────────────
-- Setiap user baru yang dibuat Supabase Auth otomatis mendapat baris profiles.
-- SECURITY DEFINER diperlukan karena pemicunya berada di auth.users, sementara
-- penulisannya ke public.profiles — fungsi berjalan sebagai pemilik tabel.
-- display_name awal diambil dari metadata atau bagian depan email; bisa
-- diganti kapan saja lewat aplikasi (kebijakan profiles_update_own).
-- Catatan: user yang dibuat SEBELUM trigger ini ada (mis. lewat "Add user"
-- dashboard) perlu backfill manual — lihat supabase/SETUP.md langkah 5a.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Pengguna'
    ),
    null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── 5. Hak akses dasar (GRANT) ───────────────────────────────────────────
-- Peran anon TIDAK diberi apa pun (default deny + tanpa kebijakan RLS).
-- Peran authenticated boleh mencoba DML; apakah benar-benar boleh, ditentukan
-- kebijakan RLS di bawah. service_role sengaja tidak disebut (melewati RLS —
-- hanya untuk skrip server terpercaya, tidak pernah untuk frontend).
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ─── 6. Fungsi bantu RLS ──────────────────────────────────────────────────
-- "Apakah user yang sedang login adalah anggota workspace ws_id?"
-- SECURITY DEFINER diperlukan untuk kebijakan pada workspace_members dan
-- workspaces: kebijakan yang membaca tabel yang sama dengan tabel yang
-- dijaga membuat PostgreSQL error "infinite recursion detected in policy".
-- Fungsi ini berjalan sebagai pemilik tabel sehingga membaca keanggotaan
-- tanpa terkena RLS — aman karena hanya menjawab satu pertanyaan tadi.
create or replace function public.is_member_of(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = ws_id
      and wm.user_id = auth.uid()
  );
$$;

-- ─── 7. Aktifkan RLS di SEMUA tabel ───────────────────────────────────────
-- Tanpa RLS aktif, anon/authenticated yang punya GRANT bisa membaca semua.
-- Dengan RLS aktif dan kebijakan di bawah, hanya anggota workspace yang lolos.
alter table public.profiles               enable row level security;
alter table public.workspaces             enable row level security;
alter table public.workspace_members      enable row level security;
alter table public.activities             enable row level security;
alter table public.activity_logs          enable row level security;
alter table public.weekly_plan_entries    enable row level security;
alter table public.energy_logs            enable row level security;
alter table public.weekly_reflections     enable row level security;
alter table public.comments               enable row level security;
alter table public.messages               enable row level security;
alter table public.transaction_categories enable row level security;
alter table public.transactions           enable row level security;
alter table public.allocation_plans       enable row level security;
alter table public.financial_targets      enable row level security;

-- ─── 8. Kebijakan RLS ─────────────────────────────────────────────────────
-- ── profiles ──
-- Baca: profil sendiri + profil rekan satu workspace (agar nama tampilan
-- masing-masing terlihat). Tulis: update baris sendiri saja. Insert/delete
-- tidak diberi kebijakan (profil dibuat trigger, dihapus cascade auth.users).
create policy "profiles_select_workspace_members" on public.profiles
  for select to authenticated
  using (
    profiles.id = auth.uid()
    or exists (
      select 1
      from public.workspace_members me
      join public.workspace_members them
        on them.workspace_id = me.workspace_id
      where me.user_id = auth.uid()
        and them.user_id = profiles.id
    )
  );

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (profiles.id = auth.uid())
  with check (profiles.id = auth.uid());

-- ── workspaces ──
-- Baca: hanya workspace tempat user menjadi anggota. Insert/update/delete
-- TIDAK diberi kebijakan: workspace dibuat manual lewat SQL Editor (postgres
-- melewati RLS) — lihat contoh di paling bawah file.
create policy "workspaces_member_select" on public.workspaces
  for select to authenticated
  using (public.is_member_of(workspaces.id));

-- ── workspace_members ──
-- Baca: semua baris keanggotaan milik workspace tempat user menjadi anggota
-- (owner dan partner saling melihat peran masing-masing). Insert/update/delete
-- TIDAK diberi kebijakan: keanggotaan dikelola dashboard/SQL Editor saja.
create policy "workspace_members_member_select" on public.workspace_members
  for select to authenticated
  using (public.is_member_of(workspace_members.workspace_id));

-- ── Pola untuk SEMUA tabel ber-scope workspace ────────────────────────────
-- Satu rantai yang sama dipakai berkali-kali di bawah:
--   exists (
--     select 1 from public.workspace_members wm
--     where wm.workspace_id = <tabel>.workspace_id
--       and wm.user_id = auth.uid()
--   )
-- Artinya: baris hanya boleh dibaca/ditulis oleh anggota workspace baris itu.
-- SELECT memakai USING, INSERT memakai WITH CHECK (memeriksa workspace_id
-- baris BARU), UPDATE memakai keduanya, DELETE memakai USING. Tanpa kebijakan,
-- akses ditolak secara default.
-- Catatan kinerja: untuk dataset besar pola "(select auth.uid())" lebih cepat
-- (init-plan); untuk dua pengguna tidak diperlukan.

-- ── activities ──
create policy "activities_member_select" on public.activities
  for select to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = activities.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "activities_member_insert" on public.activities
  for insert to authenticated
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = activities.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "activities_member_update" on public.activities
  for update to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = activities.workspace_id
      and wm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = activities.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "activities_member_delete" on public.activities
  for delete to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = activities.workspace_id
      and wm.user_id = auth.uid()
  ));

-- ── activity_logs ──
create policy "activity_logs_member_select" on public.activity_logs
  for select to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = activity_logs.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "activity_logs_member_insert" on public.activity_logs
  for insert to authenticated
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = activity_logs.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "activity_logs_member_update" on public.activity_logs
  for update to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = activity_logs.workspace_id
      and wm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = activity_logs.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "activity_logs_member_delete" on public.activity_logs
  for delete to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = activity_logs.workspace_id
      and wm.user_id = auth.uid()
  ));

-- ── weekly_plan_entries ──
create policy "weekly_plan_entries_member_select" on public.weekly_plan_entries
  for select to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = weekly_plan_entries.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "weekly_plan_entries_member_insert" on public.weekly_plan_entries
  for insert to authenticated
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = weekly_plan_entries.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "weekly_plan_entries_member_update" on public.weekly_plan_entries
  for update to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = weekly_plan_entries.workspace_id
      and wm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = weekly_plan_entries.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "weekly_plan_entries_member_delete" on public.weekly_plan_entries
  for delete to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = weekly_plan_entries.workspace_id
      and wm.user_id = auth.uid()
  ));

-- ── energy_logs ──
create policy "energy_logs_member_select" on public.energy_logs
  for select to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = energy_logs.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "energy_logs_member_insert" on public.energy_logs
  for insert to authenticated
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = energy_logs.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "energy_logs_member_update" on public.energy_logs
  for update to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = energy_logs.workspace_id
      and wm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = energy_logs.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "energy_logs_member_delete" on public.energy_logs
  for delete to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = energy_logs.workspace_id
      and wm.user_id = auth.uid()
  ));

-- ── weekly_reflections ──
create policy "weekly_reflections_member_select" on public.weekly_reflections
  for select to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = weekly_reflections.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "weekly_reflections_member_insert" on public.weekly_reflections
  for insert to authenticated
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = weekly_reflections.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "weekly_reflections_member_update" on public.weekly_reflections
  for update to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = weekly_reflections.workspace_id
      and wm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = weekly_reflections.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "weekly_reflections_member_delete" on public.weekly_reflections
  for delete to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = weekly_reflections.workspace_id
      and wm.user_id = auth.uid()
  ));

-- ── comments ──
create policy "comments_member_select" on public.comments
  for select to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = comments.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "comments_member_insert" on public.comments
  for insert to authenticated
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = comments.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "comments_member_update" on public.comments
  for update to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = comments.workspace_id
      and wm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = comments.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "comments_member_delete" on public.comments
  for delete to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = comments.workspace_id
      and wm.user_id = auth.uid()
  ));

-- ── messages ──
create policy "messages_member_select" on public.messages
  for select to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = messages.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "messages_member_insert" on public.messages
  for insert to authenticated
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = messages.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "messages_member_update" on public.messages
  for update to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = messages.workspace_id
      and wm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = messages.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "messages_member_delete" on public.messages
  for delete to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = messages.workspace_id
      and wm.user_id = auth.uid()
  ));

-- ── transaction_categories ──
create policy "transaction_categories_member_select" on public.transaction_categories
  for select to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = transaction_categories.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "transaction_categories_member_insert" on public.transaction_categories
  for insert to authenticated
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = transaction_categories.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "transaction_categories_member_update" on public.transaction_categories
  for update to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = transaction_categories.workspace_id
      and wm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = transaction_categories.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "transaction_categories_member_delete" on public.transaction_categories
  for delete to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = transaction_categories.workspace_id
      and wm.user_id = auth.uid()
  ));

-- ── transactions ──
create policy "transactions_member_select" on public.transactions
  for select to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = transactions.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "transactions_member_insert" on public.transactions
  for insert to authenticated
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = transactions.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "transactions_member_update" on public.transactions
  for update to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = transactions.workspace_id
      and wm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = transactions.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "transactions_member_delete" on public.transactions
  for delete to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = transactions.workspace_id
      and wm.user_id = auth.uid()
  ));

-- ── allocation_plans ──
create policy "allocation_plans_member_select" on public.allocation_plans
  for select to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = allocation_plans.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "allocation_plans_member_insert" on public.allocation_plans
  for insert to authenticated
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = allocation_plans.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "allocation_plans_member_update" on public.allocation_plans
  for update to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = allocation_plans.workspace_id
      and wm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = allocation_plans.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "allocation_plans_member_delete" on public.allocation_plans
  for delete to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = allocation_plans.workspace_id
      and wm.user_id = auth.uid()
  ));

-- ── financial_targets ──
create policy "financial_targets_member_select" on public.financial_targets
  for select to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = financial_targets.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "financial_targets_member_insert" on public.financial_targets
  for insert to authenticated
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = financial_targets.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "financial_targets_member_update" on public.financial_targets
  for update to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = financial_targets.workspace_id
      and wm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = financial_targets.workspace_id
      and wm.user_id = auth.uid()
  ));

create policy "financial_targets_member_delete" on public.financial_targets
  for delete to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = financial_targets.workspace_id
      and wm.user_id = auth.uid()
  ));

-- ─── 9. Opsional: Realtime untuk chat pribadi ─────────────────────────────
-- Aktifkan bila ingin pesan chat baru masuk secara realtime:
-- alter publication supabase_realtime add table public.messages;

-- ============================================================================
-- CONTOH DATA AWAL (di-comment — jalankan manual SETELAH 2 user auth dibuat)
-- ============================================================================
-- Langkah lengkap ada di supabase/SETUP.md langkah 5. Ringkasannya:
--
-- 1) Temukan UUID kedua user:
--      select id, email, created_at from auth.users order by created_at;
--
-- 2) (Sekali saja) backfill profil untuk user yang dibuat sebelum trigger
--    on_auth_user_created ada:
--      insert into public.profiles (id, display_name)
--      select u.id, split_part(u.email, '@', 1)
--      from auth.users u
--      where not exists (select 1 from public.profiles p where p.id = u.id);
--
-- 3) Ganti placeholder '<USER_A_UUID>' (pemilik) dan '<USER_B_UUID>'
--    (pasangan), lalu buat SATU workspace + DUA keanggotaan sekaligus
--    di SQL Editor (postgres melewati RLS — memang disengaja):
--
-- with ws as (
--   insert into public.workspaces (name)
--   values ('Ruang Tumbuh')
--   returning id
-- )
-- insert into public.workspace_members (workspace_id, user_id, role)
-- select ws.id, m.user_id, m.role
-- from ws,
--      (values ('<USER_A_UUID>'::uuid, 'owner'),
--              ('<USER_B_UUID>'::uuid, 'partner')) as m(user_id, role);
--
-- 4) Verifikasi:
--      select wm.role, u.email
--      from public.workspace_members wm
--      join auth.users u on u.id = wm.user_id;
--
-- Catatan desain: aplikasi sengaja tidak punya jalur "buat workspace" dari
-- frontend. Workspace dan keanggotaan hanya lahir dari sini — satu workspace,
-- dua anggota, titik.
-- ============================================================================
