# Worklog — Ruang Tumbuh

Project: Penggabungan `ruang-tumbuh-v3.html` + `buku kas.html` menjadi satu aplikasi web privat untuk 2 orang.

## Keputusan Arsitektur Global (dari analisis master prompt)

- Sandbox ini mewajibkan Next.js 16 (App Router) + SQLite/Prisma, sehingga Fase 1 dibangun
  sebagai mirror 1:1 dari arsitektur target Supabase:
  - Prisma schema = mirror dari PostgreSQL schema (tabel & field sama persis).
  - "RLS" diwujudkan sebagai enforcement server-side di setiap API route
    (session → user → workspace_members → workspace_id scoping).
  - Auth = 2 akun pre-seeded, tanpa registrasi publik, password scrypt + cookie HMAC HttpOnly.
  - `supabase/schema.sql` + `supabase/SETUP.md` disediakan sebagai jalur produksi (Supabase Auth + RLS + Realtime).
- Halaman pengguna hanya `/` (sesuai constraint sandbox): login & app shell dirender kondisional
  di `/`; navigasi antar-bagian (Today/Planner/Finance/Reflection/Chat/Settings) memakai
  view state client-side — juga setia pada pola tab single-page milik kedua HTML asli.
- Desain: mengikuti palet & tipografi ruang-tumbuh-v3.html persis:
  bg #0b0d12, panel #151922/#1b202a, teks #f5f7fb, muted #969ead, aksen violet #8b7cff,
  teal #40d7c0, lilac #b6a9ff, good #67d69a; font Fraunces (display), Work Sans (body),
  IBM Plex Mono (angka). Ringan: tanpa framer-motion, CSS transitions saja.
- Bahasa UI: Indonesia. Motto: "Jalan boleh berubah. Arah jangan."
- Filosofi yang dijaga: jadwal = panduan bukan aturan kaku; tidak ada streak/leaderboard/guilt.

## Struktur data utama (hasil inspeksi kedua file)

- ruang-tumbuh-v3.html (localStorage `ruang_tumbuh_tracker_v2`): selectedWeek (Senin),
  activities[{id,name,target,desc,duration(free text),time,days[0-6], 0=Minggu}],
  logs[{id,date,activityId,note}] (centang = selesai), energy{date:1|2|3},
  reviews{weekStart:{worked,blocked,next,sentence}}, sundayReview:boolean.
- buku kas.html (localStorage `bukukas_financial_planner_v4_auto`, version 5):
  transactions[{id,date,type(income|expense),categoryId,amount(int rupiah),note}],
  categories[{id,name,type,bucket(income|needs|wants|charity|savings|target),target}],
  selectedMonth "YYYY-MM", allocationPlan{needs:10,wants:20,charity:10,savings:20,target:40},
  targetGoal (Rp, default 5.000.000), allocationHistory (turunan dari plan; dihitung ulang
  saat plan berubah → cukup dihitung derivatif, tidak perlu tabel).
- DUA SISTEM KEUANGAN TERPISAH: (1) interpretasi 50/30/20 (lens, dihitung runtime dari bucket)
  vs (2) alokasi pemasukan 10/20/10/20/40 (tabel allocation_plans, wajib total 100%).

---
---
Task ID: 2-b
Agent: general-purpose (Supabase kit)
Task: Membuat kit produksi Supabase (schema.sql + SETUP.md) sebagai jalur deployment nyata (React/Vite atau Next.js + Supabase), mirror dari prisma/schema.prisma.

Work Log:
- Membaca worklog.md (keputusan arsitektur global) dan prisma/schema.prisma (14 model) sebagai sumber mirror 1:1.
- Membuat /home/z/my-project/supabase/schema.sql: 14 tabel (profiles, workspaces, workspace_members, activities, activity_logs, weekly_plan_entries, energy_logs, weekly_reflections, comments, messages, transaction_categories, transactions, allocation_plans, financial_targets), semuanya uuid PK gen_random_uuid(), timestamptz default now().
- CHECK constraints sesuai spek: role IN (owner,partner) + UNIQUE(workspace_id,user_id); weekly_target >= 1; preferred_start/end_time & planned_start/end_time regex 'HH:MM'; preferred_days jsonb '[]' divalidasi fungsi IMMUTABLE is_valid_preferred_days (array int 0-6); status IN (planned,done,skipped,rescheduled) + UNIQUE(activity_id,user_id,date); energy level BETWEEN 1 AND 3 + UNIQUE(user_id,date); weekly_reflections UNIQUE(user_id,week_start) + CHECK week_start = Senin; transactions type/amount>0; transaction_categories type/bucket/monthly_target>=0; allocation_plans UNIQUE(workspace_id) + CHECK jumlah 5 persentase = 100 (default 10/20/10/20/40); financial_targets amount check.
- FK: semua tabel ber-scope workspace -> workspaces(id) ON DELETE CASCADE; activity_logs.activity_id -> activities(id) CASCADE; transactions.category_id -> transaction_categories(id) CASCADE (dengan komentar: larangan hapus kategori terpakai ditegakkan di app level); semua kolom user -> auth.users(id) ON DELETE CASCADE. Tidak ada kolom password di mana pun.
- Trigger updated_at (12 tabel, meniru @updatedAt Prisma) + trigger on_auth_user_created (fungsi SECURITY DEFINER handle_new_user) yang membuat baris profiles otomatis untuk setiap user auth baru.
- Index: workspace_id pada semua tabel ber-scope workspace; (workspace_id,date) untuk transactions/activity_logs/weekly_plan_entries/energy_logs; (workspace_id,week_start); (workspace_id,entity_type,entity_id); (workspace_id,created_at) untuk messages.
- RLS diaktifkan di 14 tabel. Pola kebijakan: EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = <tabel>.workspace_id AND wm.user_id = auth.uid()) untuk SELECT/INSERT(WITH CHECK)/UPDATE/DELETE pada 11 tabel ber-scope workspace; profiles: SELECT profil sendiri + rekan satu workspace, UPDATE hanya baris sendiri; workspaces & workspace_members: SELECT via fungsi SECURITY DEFINER is_member_of() (menghindari error infinite recursion Postgres), tanpa INSERT/UPDATE/DELETE dari API. GRANT DML hanya ke role authenticated; anon tanpa akses.
- Menambahkan contoh ter-comment di bawah file: backfill profiles + CTE insert 1 workspace + 2 workspace_members (owner/partner) dengan placeholder <USER_A_UUID>/<USER_B_UUID>; plus opsi Realtime (publication supabase_realtime + messages) di-comment.
- Membuat /home/z/my-project/supabase/SETUP.md: panduan deploy 10 langkah dalam bahasa Indonesia (buat project Supabase + anon key; matikan signup publik; buat 2 user tanpa password bocor; jalankan schema.sql; backfill profile + query UUID + buat workspace & members via SQL Editor; env vars NEXT_PUBLIC_/VITE_ (hanya anon key, service_role tidak pernah di frontend); Site URL + Redirect URLs produksi & localhost; deploy Vercel; penjelasan rantai RLS auth.uid() -> workspace_members -> workspace_id; reset password opsional jalur aplikasi & manual) + checklist akhir.
- Verifikasi kuantitatif: 14 create table, 14 enable row level security, 48 create policy, 13 trigger, 11 index, tanpa kolom password.

Stage Summary:
- supabase/schema.sql: schema PostgreSQL produksi lengkap (14 tabel, RLS penuh 48 kebijakan, trigger profil otomatis, CHECK + UNIQUE + index sesuai spek) — siap dijalankan sekali di SQL Editor Supabase.
- supabase/SETUP.md: panduan deploy berbahasa Indonesia 10 langkah + checklist untuk pemilik project (Supabase -> 2 user -> SQL seed 1 workspace/2 member -> env vars -> Vercel).
- Jalur produksi kini lengkap berdampingan dengan mirror sandbox: prisma/schema.prisma (SQLite) <-> supabase/schema.sql (Postgres + RLS).
---
Task ID: 1, 2-a, 3, 4, 5, 7, 8
Agent: main (Z.ai Code)
Task: Analisis kedua HTML, implementasi Fase 1 (fondasi: auth 2 akun, workspace, RLS-ekuivalen, layout, navigasi, settings), verifikasi browser.

Work Log:
- Membaca utuh ruang-tumbuh-v3.html (527 baris) & buku kas.html (1339 baris); mengekstrak state localStorage, fitur, palet visual, dan filosofi UX.
- Menulis prisma/schema.prisma lengkap 14 model (mirror supabase/schema.sql); bun run db:push OK.
- Membuat src/lib/password.ts (scrypt), src/lib/auth.ts (cookie HttpOnly HMAC, rantai auth.uid→member→workspace), src/lib/rate-limit.ts (8 percobaan/15 mnt).
- Seed: prisma/seed.ts — 2 profil (Ihsan/owner, Mitra/partner), 1 workspace "Ruang Tumbuh", allocation plan 10/20/10/20/40. Kredensial di .env (tidak di source).
- API: POST /api/auth/login, POST /api/auth/logout, GET /api/session, PATCH /api/profile (zod), GET /api/export (JSON portabel). Semua verifikasi keanggotaan di server; tanpa cookie → 401.
- UI: globals.css dengan palet RT v3 persis (bg #0b0d12, panel #151922, violet #8b7cff, teal #40d7c0, lilac #b6a9ff) + utilitas rt-sheet/rt-fine/rt-kicker; layout.tsx dengan Fraunces + Work Sans + IBM Plex Mono (next/font, lang=id).
- Komponen: login-screen (tanpa registrasi, error generik), app-shell (sidebar desktop + bottom-nav mobile 6 bagian + footer mt-auto sticky), today-section (tanggal perangkat via useSyncExternalStore), coming-section (Fase 2–5 dengan copy Indonesia + filosofi), settings-view (edit nama tampilan, daftar anggota + peran, ekspor JSON, logout).
- Navigasi antar-bagian: view state client-side (localStorage, useSyncExternalStore) — sesuai constraint sandbox satu route "/" dan setia pada pola tab kedua aplikasi asli.
- Verifikasi agent-browser: login salah→error generik; login benar→shell; 6 bagian render; edit nama tersimpan (refresh persist); ekspor mengunduh JSON; logout→login; partner login OK; PATCH validasi 400; mobile 390px OK; tanpa error konsol/hidrasi. curl: 401 tanpa cookie.
- Perbaikan lint: setState-in-effect → useSyncExternalStore (today-section & app-shell).

Stage Summary:
- Fase 1 SELESAI & terverifikasi end-to-end. Demo: ihsan@ruangtumbuh.app / mitra@ruangtumbuh.app (password di .env).
- Produksi Supabase siap: supabase/schema.sql (14 tabel, 48 policy RLS, trigger profil, constraint alokasi=100) + supabase/SETUP.md (10 langkah, bahasa Indonesia).
- Fase 2 berikutnya: Today + Planner (aktivitas, log 4 status, energi, rescheduling first-class).

---
Task ID: Hotfix-1 (insiden login gagal)
Agent: main (Z.ai Code)
Task: Diagnosa "Gagal masuk. Coba lagi." pada login mitra@ruangtumbuh.app (laporan user + screenshot).

Work Log:
- Baca dev.log: query Profile by email SUKSES, password verifikasi LOLOS, crash di auth.ts getSecret() — `SESSION_SECRET belum dikonfigurasi di .env` → POST /api/auth/login 500 → frontend menampilkan error generik.
- Inspeksi .env: hanya berisi DATABASE_URL. Variabel SESSION_SECRET + SEED_* hilang (diduga .env ter-reset saat restore environment; file DB tetap utuh).
- Verifikasi DB via script: kedua profil ada (ihsan=owner, mitra=partner), keduanya cocok dengan password `Tumbuh-2026-Dua`; workspace "Ruang Tumbuh" utuh.
- Pulihkan .env: SESSION_SECRET (openssl rand -base64 32) + SEED_OWNER/PARTNER EMAIL/PASSWORD (kredensial tidak pernah ditulis di source code).
- Restart server: temuan lingkungan — sandbox membunuh SEMUA proses latar yang di-spawn dari sesi tool dalam 1-2 detik setelah perintah selesai (setsid/nohup tidak membantu, cgroup read-only). Dev server asli hanya berjalan karena di-spawn boot script /start.sh (kini zombie, tanpa respawn). Tidak ada mekanisme respawn (tanpa atd/crond/systemd; supervisor python /app/main.py tidak bereaksi terhadap perubahan file).
- Verifikasi lengkap DALAM SATU sesi (9/9 lolos): login salah→401 generik; login mitra→200+cookie rt_session; /api/session→konteks workspace+role partner; tanpa cookie→401; login ihsan→200+role owner; GET /→render "Ruang Tumbuh"; logout→200 lalu sesi 401.

Stage Summary:
- Akar masalah: .env kehilangan SESSION_SECRET (bukan password salah). SUDAH DIPERBAIKI dan terverifikasi end-to-end via API.
- .env kembali lengkap (DATABASE_URL, SESSION_SECRET, SEED_*). Kredensial kedua akun: password sama-sama `Tumbuh-2026-Dua`.
- Keterbatasan lingkungan terkonfirmasi: hanya boot script yang dapat menjalankan dev server persisten. Setelah environment di-refresh/restart, `next dev` akan hidup lagi memakai .env yang sudah diperbaiki → login langsung berhasil.
