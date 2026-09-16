-- Memisahkan kepemilikan data personal dalam workspace yang tetap transparan.
-- Kedua anggota masih dapat SELECT detail satu sama lain, namun hanya pembuat
-- yang dapat mengubah/hapus transaksi, aktivitas, dan log kebiasaannya.

drop policy if exists "activities_member_update" on public.activities;
drop policy if exists "activities_member_delete" on public.activities;
drop policy if exists "activities_member_insert" on public.activities;
drop policy if exists "activity_logs_member_update" on public.activity_logs;
drop policy if exists "activity_logs_member_delete" on public.activity_logs;
drop policy if exists "activity_logs_member_insert" on public.activity_logs;
drop policy if exists "weekly_plan_entries_member_update" on public.weekly_plan_entries;
drop policy if exists "weekly_plan_entries_member_delete" on public.weekly_plan_entries;
drop policy if exists "weekly_plan_entries_member_insert" on public.weekly_plan_entries;
drop policy if exists "transactions_member_update" on public.transactions;
drop policy if exists "transactions_member_delete" on public.transactions;
drop policy if exists "transactions_member_insert" on public.transactions;

create policy "activities_owner_insert" on public.activities for insert to authenticated
  with check (created_by = auth.uid() and public.is_member_of(workspace_id));
create policy "activities_owner_update" on public.activities for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "activities_owner_delete" on public.activities for delete to authenticated
  using (created_by = auth.uid());

create policy "activity_logs_owner_insert" on public.activity_logs for insert to authenticated
  with check (user_id = auth.uid() and public.is_member_of(workspace_id));
create policy "activity_logs_owner_update" on public.activity_logs for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "activity_logs_owner_delete" on public.activity_logs for delete to authenticated
  using (user_id = auth.uid());

create policy "weekly_plan_entries_owner_insert" on public.weekly_plan_entries for insert to authenticated
  with check (user_id = auth.uid() and public.is_member_of(workspace_id));
create policy "weekly_plan_entries_owner_update" on public.weekly_plan_entries for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "weekly_plan_entries_owner_delete" on public.weekly_plan_entries for delete to authenticated
  using (user_id = auth.uid());

create policy "transactions_owner_insert" on public.transactions for insert to authenticated
  with check (created_by = auth.uid() and public.is_member_of(workspace_id));
create policy "transactions_owner_update" on public.transactions for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "transactions_owner_delete" on public.transactions for delete to authenticated
  using (created_by = auth.uid());
