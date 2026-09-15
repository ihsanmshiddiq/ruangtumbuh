-- ============================================================================
-- MIGRATION 002 — alokasi pemasukan jadi POS BEBAS (tambah/hapus/ganti nama)
-- Jalankan di Supabase SQL Editor SETELAH migration-001-fase5.sql.
-- Aman dijalankan ulang (idempoten). Tidak ada data yang dihapus: angka
-- alokasi lama (10/20/10/20/40 atau yang sudah diubah) otomatis dipindah
-- ke tabel baru saat migration ini jalan.
--
-- Catatan: tabel lama allocation_plans tidak dihapus — cuma tidak dipakai
-- aplikasi lagi (disimpan demi riwayat).
-- ============================================================================

-- 1) Tabel baru: satu baris = satu pos alokasi per workspace.
create table if not exists public.allocation_items (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  label         text not null check (length(btrim(label)) between 1 and 40),
  percent       integer not null check (percent >= 0 and percent <= 100),
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists allocation_items_workspace_idx on public.allocation_items (workspace_id);

drop trigger if exists allocation_items_set_updated_at on public.allocation_items;
create trigger allocation_items_set_updated_at
  before update on public.allocation_items
  for each row execute function public.set_updated_at();

-- 2) RLS — pola sama dengan tabel lain: hanya anggota workspace.
alter table public.allocation_items enable row level security;

drop policy if exists "allocation_items_member_select" on public.allocation_items;
create policy "allocation_items_member_select" on public.allocation_items
  for select to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = allocation_items.workspace_id
      and wm.user_id = auth.uid()
  ));

drop policy if exists "allocation_items_member_insert" on public.allocation_items;
create policy "allocation_items_member_insert" on public.allocation_items
  for insert to authenticated
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = allocation_items.workspace_id
      and wm.user_id = auth.uid()
  ));

drop policy if exists "allocation_items_member_update" on public.allocation_items;
create policy "allocation_items_member_update" on public.allocation_items
  for update to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = allocation_items.workspace_id
      and wm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = allocation_items.workspace_id
      and wm.user_id = auth.uid()
  ));

drop policy if exists "allocation_items_member_delete" on public.allocation_items;
create policy "allocation_items_member_delete" on public.allocation_items
  for delete to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = allocation_items.workspace_id
      and wm.user_id = auth.uid()
  ));

-- 3) Pindahkan rencana lama → baru (hanya workspace yang belum punya pos).
insert into public.allocation_items (workspace_id, label, percent, position)
select
  p.workspace_id,
  x.label,
  x.percent,
  x.ord
from public.allocation_plans p
cross join lateral (values
  ('Kebutuhan',   p.needs_percent,   0),
  ('Keinginan',   p.wants_percent,   1),
  ('Sedekah',     p.charity_percent, 2),
  ('Tabungan',    p.savings_percent, 3),
  ('Dana target', p.target_percent,  4)
) as x(label, percent, ord)
where not exists (
  select 1 from public.allocation_items ai where ai.workspace_id = p.workspace_id
);

-- Workspace baru tanpa baris lama pun tetap aman: aplikasi otomatis mengisi
-- bawaan 10/20/10/20/40 saat pertama kali membuka halaman Buku Kas.

-- ── 4) Verifikasi (opsional, jalankan terpisah) ────────────────────────────
-- Semua policy harus muncul:
--   select policyname, cmd from pg_policies
--    where tablename = 'allocation_items' order by policyname;
-- Data lama terpindah (5 baris per workspace):
--   select workspace_id, count(*), sum(percent) from public.allocation_items
--    group by workspace_id;   -- sum harus 100
