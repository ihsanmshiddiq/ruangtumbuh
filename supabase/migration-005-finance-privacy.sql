-- Keuangan pribadi: transaksi tidak lagi dapat dibaca oleh anggota workspace
-- lain. Jalankan sekali di Supabase SQL Editor SETELAH migration-004.
-- Tidak ada data yang dihapus atau dipindahkan.

drop policy if exists "transactions_member_select" on public.transactions;
drop policy if exists "transactions_owner_select" on public.transactions;

create policy "transactions_owner_select" on public.transactions
  for select to authenticated
  using (created_by = auth.uid());
