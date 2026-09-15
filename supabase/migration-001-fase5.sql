-- ============================================================================
-- MIGRATION 001 — Fase 5 (security & hardening)
-- Jalankan SEKALI di Supabase SQL Editor, SETELAH schema.sql.
-- Aman dijalankan ulang (idempoten). Tidak ada operasi destruktif pada data.
-- ============================================================================

-- ── 1) Status baru 'unavailable' ───────────────────────────────────────────
-- unavailable = aktivitas tidak dapat dilakukan pada waktu tersebut dan TIDAK
-- digeser. Alasan/konteks ditulis di kolom `note` (sudah ada di schema).
do $$
declare c text;
begin
  -- activity_logs.status
  select conname into c
  from pg_constraint
  where conrelid = 'public.activity_logs'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status in%'
    and pg_get_constraintdef(oid) not ilike '%unavailable%'
  limit 1;
  if c is not null then
    execute format('alter table public.activity_logs drop constraint %I', c);
    execute 'alter table public.activity_logs add constraint activity_logs_status_check ' ||
            $fase5$check (status in ('planned', 'done', 'skipped', 'rescheduled', 'unavailable'))$fase5$;
  end if;

  -- weekly_plan_entries.status
  select conname into c
  from pg_constraint
  where conrelid = 'public.weekly_plan_entries'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status in%'
    and pg_get_constraintdef(oid) not ilike '%unavailable%'
  limit 1;
  if c is not null then
    execute format('alter table public.weekly_plan_entries drop constraint %I', c);
    execute 'alter table public.weekly_plan_entries add constraint weekly_plan_entries_status_check ' ||
            $fase5$check (status in ('planned', 'done', 'skipped', 'rescheduled', 'unavailable'))$fase5$;
  end if;
end $$;

-- ── 2) Identitas penulis terikat sesi (auth.uid()) ─────────────────────────
-- Prinsip: identitas berasal dari sesi/database, BUKAN dari input frontend.
-- INSERT: kolom user wajib = auth.uid(). UPDATE: baris tetap milik penulisnya
-- (WITH CHECK user_id = auth.uid()). activities/transactions memakai trigger
-- perekat created_by agar atribusi tidak bisa diubah lewat API.

-- 2a. activities (created_by)
drop policy if exists "activities_member_insert" on public.activities;
create policy "activities_member_insert" on public.activities
  for insert to authenticated
  with check (
    activities.created_by = auth.uid()
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = activities.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "activities_member_update" on public.activities;
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

-- 2b. activity_logs / weekly_plan_entries / energy_logs / weekly_reflections /
--     comments — pola identik (INSERT & UPDATE terikat auth.uid()).
drop policy if exists "activity_logs_member_insert" on public.activity_logs;
create policy "activity_logs_member_insert" on public.activity_logs
  for insert to authenticated
  with check (
    activity_logs.user_id = auth.uid()
    and exists (select 1 from public.workspace_members wm
                where wm.workspace_id = activity_logs.workspace_id and wm.user_id = auth.uid())
  );

drop policy if exists "activity_logs_member_update" on public.activity_logs;
create policy "activity_logs_member_update" on public.activity_logs
  for update to authenticated
  using (exists (select 1 from public.workspace_members wm
                 where wm.workspace_id = activity_logs.workspace_id and wm.user_id = auth.uid()))
  with check (
    activity_logs.user_id = auth.uid()
    and exists (select 1 from public.workspace_members wm
                where wm.workspace_id = activity_logs.workspace_id and wm.user_id = auth.uid())
  );

drop policy if exists "weekly_plan_entries_member_insert" on public.weekly_plan_entries;
create policy "weekly_plan_entries_member_insert" on public.weekly_plan_entries
  for insert to authenticated
  with check (
    weekly_plan_entries.user_id = auth.uid()
    and exists (select 1 from public.workspace_members wm
                where wm.workspace_id = weekly_plan_entries.workspace_id and wm.user_id = auth.uid())
  );

drop policy if exists "weekly_plan_entries_member_update" on public.weekly_plan_entries;
create policy "weekly_plan_entries_member_update" on public.weekly_plan_entries
  for update to authenticated
  using (exists (select 1 from public.workspace_members wm
                 where wm.workspace_id = weekly_plan_entries.workspace_id and wm.user_id = auth.uid()))
  with check (
    weekly_plan_entries.user_id = auth.uid()
    and exists (select 1 from public.workspace_members wm
                where wm.workspace_id = weekly_plan_entries.workspace_id and wm.user_id = auth.uid())
  );

drop policy if exists "energy_logs_member_insert" on public.energy_logs;
create policy "energy_logs_member_insert" on public.energy_logs
  for insert to authenticated
  with check (
    energy_logs.user_id = auth.uid()
    and exists (select 1 from public.workspace_members wm
                where wm.workspace_id = energy_logs.workspace_id and wm.user_id = auth.uid())
  );

drop policy if exists "energy_logs_member_update" on public.energy_logs;
create policy "energy_logs_member_update" on public.energy_logs
  for update to authenticated
  using (exists (select 1 from public.workspace_members wm
                 where wm.workspace_id = energy_logs.workspace_id and wm.user_id = auth.uid()))
  with check (
    energy_logs.user_id = auth.uid()
    and exists (select 1 from public.workspace_members wm
                where wm.workspace_id = energy_logs.workspace_id and wm.user_id = auth.uid())
  );

drop policy if exists "weekly_reflections_member_insert" on public.weekly_reflections;
create policy "weekly_reflections_member_insert" on public.weekly_reflections
  for insert to authenticated
  with check (
    weekly_reflections.user_id = auth.uid()
    and exists (select 1 from public.workspace_members wm
                where wm.workspace_id = weekly_reflections.workspace_id and wm.user_id = auth.uid())
  );

drop policy if exists "weekly_reflections_member_update" on public.weekly_reflections;
create policy "weekly_reflections_member_update" on public.weekly_reflections
  for update to authenticated
  using (exists (select 1 from public.workspace_members wm
                 where wm.workspace_id = weekly_reflections.workspace_id and wm.user_id = auth.uid()))
  with check (
    weekly_reflections.user_id = auth.uid()
    and exists (select 1 from public.workspace_members wm
                where wm.workspace_id = weekly_reflections.workspace_id and wm.user_id = auth.uid())
  );

drop policy if exists "comments_member_insert" on public.comments;
create policy "comments_member_insert" on public.comments
  for insert to authenticated
  with check (
    comments.user_id = auth.uid()
    and exists (select 1 from public.workspace_members wm
                where wm.workspace_id = comments.workspace_id and wm.user_id = auth.uid())
  );

drop policy if exists "comments_member_update" on public.comments;
create policy "comments_member_update" on public.comments
  for update to authenticated
  using (
    comments.user_id = auth.uid()
    and exists (select 1 from public.workspace_members wm
                where wm.workspace_id = comments.workspace_id and wm.user_id = auth.uid())
  )
  with check (
    comments.user_id = auth.uid()
    and exists (select 1 from public.workspace_members wm
                where wm.workspace_id = comments.workspace_id and wm.user_id = auth.uid())
  );

-- 2c. transactions (created_by) — buku kas bersama: anggota workspace saling
--     bisa mengoreksi, tetapi identitas pembuat TIDAK boleh diubah.
drop policy if exists "transactions_member_insert" on public.transactions;
create policy "transactions_member_insert" on public.transactions
  for insert to authenticated
  with check (
    transactions.created_by = auth.uid()
    and exists (select 1 from public.workspace_members wm
                where wm.workspace_id = transactions.workspace_id and wm.user_id = auth.uid())
  );

-- 2d. Perekat atribusi: created_by tidak boleh berubah lewat API apa pun.
create or replace function public.freeze_created_by()
returns trigger
language plpgsql
as $$
begin
  new.created_by = old.created_by;
  return new;
end;
$$;

drop trigger if exists activities_freeze_created_by on public.activities;
create trigger activities_freeze_created_by
  before update on public.activities
  for each row execute function public.freeze_created_by();

drop trigger if exists transactions_freeze_created_by on public.transactions;
create trigger transactions_freeze_created_by
  before update on public.transactions
  for each row execute function public.freeze_created_by();

-- ── 3) Chat append-only ────────────────────────────────────────────────────
-- Pesan tidak boleh diedit/dihapus lewat API oleh siapa pun, dan pengirim
-- selalu = sesi yang sedang login.
drop policy if exists "messages_member_update" on public.messages;
drop policy if exists "messages_member_delete" on public.messages;

drop policy if exists "messages_member_insert" on public.messages;
create policy "messages_member_insert" on public.messages
  for insert to authenticated
  with check (
    messages.sender_id = auth.uid()
    and exists (select 1 from public.workspace_members wm
                where wm.workspace_id = messages.workspace_id and wm.user_id = auth.uid())
  );

-- ── 4) Verifikasi ──────────────────────────────────────────────────────────
-- Semua policy harus muncul; messages hanya select+insert:
--   select tablename, policyname, cmd from pg_policies
--   where schemaname = 'public' order by tablename, policyname;
-- Constraint status sudah memuat 'unavailable':
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid in ('public.activity_logs'::regclass, 'public.weekly_plan_entries'::regclass)
--     and pg_get_constraintdef(oid) ilike '%status in%';
