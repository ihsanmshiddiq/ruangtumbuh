-- ============================================================================
-- HUBUNGKAN KEDUA USER KE WORKSPACE — langkah 5 SETUP.md, siap jalan.
-- Tempel & Run SEKALI di Supabase SQL Editor.
-- Aman dijalankan ulang: baris yang sudah ada TIDAK diduplikasi
-- (unique (workspace_id, user_id) + on conflict do nothing).
-- ============================================================================

-- 1) Buat workspace "Ruang Tumbuh" hanya jika BELUM ada — pakai yang sudah
--    ada kalau pernah dibuat supaya data lama tetap nyambung.
insert into public.workspaces (name)
select 'Ruang Tumbuh'
where not exists (select 1 from public.workspaces where name = 'Ruang Tumbuh');

-- 2) Pastikan kedua user punya profil (untuk nama tampilan di UI).
insert into public.profiles (id, display_name)
select u.id, split_part(u.email, '@', 1)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- 3) Sambungkan SEMUA user auth ke workspace — di project ini isinya memang
--    tepat dua orang (Ihsan & Tantri). User pertama jadi owner, sisanya partner.
with ws as (select id from public.workspaces where name = 'Ruang Tumbuh' limit 1),
     us as (
       select u.id, row_number() over (order by u.created_at) as rn
       from auth.users u
       order by u.created_at
     )
insert into public.workspace_members (workspace_id, user_id, role)
select ws.id, us.id, case when us.rn = 1 then 'owner' else 'partner' end
from ws, us
on conflict (workspace_id, user_id) do nothing;

-- 4) Verifikasi — harus muncul 2 baris (owner + partner):
select wm.role, u.email
from public.workspace_members wm
join auth.users u on u.id = wm.user_id
order by wm.role;
