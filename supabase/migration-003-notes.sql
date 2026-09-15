-- ============================================================================
-- MIGRATION 003 — fitur Notes (catatan pribadi & dibagikan)
-- Jalankan di Supabase SQL Editor SETELAH migration-002-alokasi-bebas.sql.
-- Aman dijalankan ulang (idempoten). Tidak ada data yang dihapus.
--
-- Aturan akses (ditegakkan RLS, bukan frontend):
--   SELECT : note milik sendiri  ATAU note partner ber-visibility 'shared'
--   INSERT : hanya sebagai diri sendiri (author_id = auth.uid()) di workspace
--            yang diikuti
--   UPDATE : hanya note milik sendiri (dan author_id tidak bisa diganti)
--   DELETE : hanya note milik sendiri
-- ============================================================================

-- 1) Tabel
create table if not exists public.notes (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  title        text not null check (length(btrim(title)) between 1 and 120),
  content      text not null default '' check (length(content) <= 20000),
  visibility   text not null default 'private'
               check (visibility in ('private', 'shared')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists notes_workspace_visibility_idx on public.notes (workspace_id, visibility);
create index if not exists notes_author_idx on public.notes (author_id);

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- 2) RLS
alter table public.notes enable row level security;

-- SELECT: milik sendiri ATAU shared dari sesama anggota workspace
drop policy if exists "notes_member_select" on public.notes;
create policy "notes_member_select" on public.notes
  for select to authenticated
  using (
    author_id = auth.uid()
    or (
      visibility = 'shared'
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = notes.workspace_id
          and wm.user_id = auth.uid()
      )
    )
  );

-- INSERT: hanya sebagai diri sendiri, di workspace yang diikuti
drop policy if exists "notes_author_insert" on public.notes;
create policy "notes_author_insert" on public.notes
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = notes.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- UPDATE: hanya note milik sendiri; author_id tidak boleh berpindah
drop policy if exists "notes_author_update" on public.notes;
create policy "notes_author_update" on public.notes
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- DELETE: hanya note milik sendiri
drop policy if exists "notes_author_delete" on public.notes;
create policy "notes_author_delete" on public.notes
  for delete to authenticated
  using (author_id = auth.uid());

-- ── 3) Verifikasi (opsional, jalankan terpisah) ────────────────────────────
--   select policyname, cmd from pg_policies where tablename = 'notes' order by policyname;
--   -- harus muncul 4 policy: select / insert / update / delete
