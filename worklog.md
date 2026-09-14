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

---
Task ID: 6-a (Mode Pratinjau — login ditunda)
Agent: main (Z.ai Code)
Task: Permintaan user — jangan tampilkan halaman login dulu; preview aplikasi langsung; login diaktifkan kembali di akhir pengembangan.

Work Log:
- Diagnosis tambahan: environment restart me-RESET .env (hanya tersisa DATABASE_URL) sementara db/custom.db tetap persisten → login gagal lagi (SESSION_SECRET hilang). Pelajaran: secret/flag lintas-restart tidak boleh hanya di .env.
- src/lib/auth.ts: (1) AUTH_BYPASS (konstan true; env AUTH_BYPASS=0 memaksa mati) — getMembershipContext tanpa cookie valid mengembalikan konteks anggota pertama workspace (pemilik) dengan authMode "bypass"; sesi cookie valid tetap menang. (2) getSecret berlapis: env → tabel AppConfig (dibuat via $executeRawUnsafe, di luar schema.prisma agar mirror Supabase tetap 1:1) → generate & simpan permanen; secret kini TAHAN reset .env.
- src/lib/types.ts: SessionContext + authMode ("session" | "bypass").
- app-shell.tsx: badge "PRATINJAU" menggantikan tombol keluar + label "mode pratinjau" saat bypass; handleLogout tetap untuk mode sesi.
- settings-view.tsx: bagian Akun menampilkan penjelasan mode pratinjau (login ditunda, tidak dihapus) dan menyembunyikan tombol Keluar saat bypass.
- session/profile/export route: + `export const dynamic = "force-dynamic"` — route GET pembaca cookie sebelumnya ter-serve cache stale (bukti: /api/export hasil baru, /api/session 401 lama) → kini selalu dinamis.
- next.config.ts: devIndicators: false — tombol devtools melayang "N" menutupi tab navigasi bawah paling kiri di mobile (terbukti saat uji klik).
- Verifikasi agent-browser: GET / langsung AppShell (bukan login); 6 bagian render; edit nama tersimpan (PATCH via bypass) lalu dikembalikan ke "Ihsan"; ekspor OK; Pengaturan→Akun menampilkan mode pratinjau; mobile 390px: bottom nav bersih tanpa overlay, footer menempel; konsol tanpa error. curl: /api/session tanpa cookie = 200 authMode bypass; login regresi benar=200/salah=401; lint bersih.

Stage Summary:
- LOGIN DITUNDA, TIDAK DIHAPUS: aktifkan kembali dengan `AUTH_BYPASS = false` di src/lib/auth.ts (atau env AUTH_BYPASS=0) + tampilkan LoginScreen kembali — layar login, rate limit, dan alur cookie tetap utuh.
- Secret sesi sekarang bertahan di DB (AppConfig) → login siap dipakai kapan pun tanpa risiko .env ter-reset.
- UI berbahasa Indonesia menyatakan status mode pratinjau secara jujur (badge + penjelasan di Pengaturan).

---
Task ID: Fase-2 (Responsif mobile-first + PWA)
Agent: Buffy (Freebuff)
Task: Fase 2 — aplikasi sepenuhnya responsif, mobile-first, sentuhan nyaman, dan dapat dipasang sebagai PWA, tanpa mengubah identitas visual Fase 1 dan tanpa membangun Fase 3–5.

Work Log:
- Ikon PWA dibuat dari identitas Ruang Tumbuh sendiri (bukan ikon generik): latar #0b0d12 + pendar violet/teal + glif tunas dviolet-teal berbatang #67d69a — via scripts/generate-pwa-icons.mjs (sharp): icon-192/512, maskable 192/512 (glif diskalakan 0.8, full-bleed), apple-touch-icon 180 (full-bleed, iOS yang membulatkan), favicon-32.
- PWA inti: public/manifest.webmanifest (name/short_name Ruang Tumbuh, display standalone, start_url/scope /, theme+background #0b0d12, lang id, orientation portrait-primary, 4 ikon); public/offline.html (fallback luring bergaya RT, safe-area, tombol coba lagi); public/sw.js — SW kecil dan aman: TIDAK ada cache untuk /api/* (data privat selalu jaringan), hanya aset statis (/_next/static, /icons, manifest, woff2/css/js) cache-first; navigasi network-first dengan fallback offline.html; navigasi preload; pembersihan cache antar versi (rt-v1).
- Client PWA (src/components/pwa/pwa-client.tsx): ServiceWorkerRegistrar (registrasi /sw.js hanya di https/localhost, toast "versi baru siap" saat update); OfflineBanner (status navigator.onLine yang jujur — tidak pernah berpura-pura tersinkron); InstallPromptCard (menangkap beforeinstallprompt tanpa popup bawaan, dismiss diingat 14 hari, tidak tampil saat standalone; iOS tanpa kartu otomatis — petunjuk manual di Pengaturan). Ketiganya dirender di area konten mobile; registrar di layout.tsx.
- layout.tsx: manifest + icons + appleWebApp (capable, black-translucent) + application-name; viewportFit: "cover" → env(safe-area-inset-*) aktif; min-h-screen → min-h-dvh.
- app-shell.tsx: skip-link "Langsung ke konten"; header mobile menghormati safe-area atas (pt-[calc(env+0.75rem)]); main pakai padding bawah calc(4.6rem+env(safe-area-inset-bottom)) agar konten tidak tertutup navbar (footer idem); bottom nav ditingkatkan — tinggi tetap 56px (h-14, ≥44px target), ikon 19px, titik penanda aktif selain warna (bukan warna saja), select-none + touch-manipulation, active: state tanpa hover; OfflineBanner + InstallPromptCard di ujung konten mobile; footer label Fase 2.
- globals.css: -webkit-tap-highlight-color transparan + touch-action: manipulation untuk semua kontrol; guard iOS zoom (font-size 16px utk input di <768px); min-height 44px utk tombol di pointer coarse; util .rt-no-scrollbar utk gulir horizontal yang disengaja; prefers-reduced-motion mematikan animasi; breakpoint xs:400px (Tailwind v4 CSS-first via @theme --breakpoint-xs — tailwind.config.ts legacy tidak dipakai, dikembalikan utuh).
- Halaman: heading dikecilkan di ponsel kecil (text-[1.35rem] → xs:text-2xl → sm:text-3xl, leading 1.15); login-screen responsif (min-h-dvh + safe-area, heading 1.9rem di <400px, tombol Masuk h-12, tombol mata target sentuh lebih besar); settings-view dapat bagian baru "Aplikasi di ponsel" — petunjuk pasang Android Chrome & iPhone Safari + catatan keamanan data.
- Nama partner: displayName "Mitra" → "Tantri" di DB live (email mitra@ruangtumbuh.app tidak diubah) dan di prisma/seed.ts — sesuai spek dua orang: Ihsan & Tantri.
- Perbaikan lingkungan Windows (penyebab 500 di mesin lokal, bukan bug kode): (1) folder project mengandung spasi ("Merge ruang tumbuh dan buku kas") + DATABASE_URL lama menunjuk path sandbox Linux /home/z/my-project → Prisma SQLite "Error code 14: Unable to open the database file"; .env kini memakai path absolut Windows file:C:/Users/DELL/Downloads/Merge ruang tumbuh dan buku kas/db/custom.db. Catatan: shell tooling sandbox masih menyuntik env DATABASE_URL lama yang menimpa .env — jalankan dev dari terminal user biasa.
- Verifikasi: tsc --noEmit bersih (2 error pre-existing di examples/websocket, di luar app); eslint 0 masalah; next build kompilasi sukses (skrip cp standalone gagal di Windows — pre-existing); manifest JSON valid; sw lolos node --check; smoke test dev server: / 200, /api/session 200 (bypass), login salah 401, /sw.js /manifest /offline.html /icons/* semua 200, marker UI (skip-link, navigasi bawah, ikon manifest) ada di HTML, 0 error Prisma.

Stage Summary:
- Fase 2 SELESAI: mobile-first responsif (320–1440px), navbar bawah dengan safe-area & target sentuh ≥44px, dvh bukan vh, modasi keyboard iOS, PWA terpasang (manifest + ikon RT + SW aman + offline UX + ajakan pasang halus + petunjuk iOS di Pengaturan).
- Keamanan tak berubah: SW tidak pernah cache /api/*, tanpa registrasi publik, bypass pratinjau Fase 1 tetap seperti semula, RLS-ekuivalen server-side utuh.
- Sengaja ditunda ke Fase 3+ (belum dibangun): Today/Planner/Finance/Reflection/Chat fungsional — masih placeholder Fase 1; draft-lokal teks offline kompleks (cukup banner jujur); sinkronisasi offline penuh (tidak diminta).
- Catatan lingkungan: shell tooling sandbox menyuntik DATABASE_URL lama (path Linux) yang menimpa .env — dev server dari terminal user sudah benar; build standalone cp gagal di Windows (pre-existing, skrip package.json).

---
Task ID: Tahap-0 (git hygiene + rotasi rahasia) & Fase-3 (bangun inti + poles)
Agent: Buffy (Freebuff)
Task: Bersihkan git sebelum push remote GitHub, rotasi rahasia yang sempat masuk riwayat, lalu bangun fitur inti (Today/Planner/Finance/Reflection/Chat) dengan standar UX Fase 3 (feedback, loading, empty, error).

Work Log:
- GIT: core.filemode false (100+ "modified" palsu akibat Linux→Windows); .env & db/custom.db dikeluarkan dari tracking (riwayat lama 2 commit memuat SESSION_SECRET + password lama); .gitignore + db/, *.db, tool-results/; .env.example ditambahkan; REMOTE github.com/ihsanmshiddiq/ruangtumbuh di-push (repo privat). Rotasi: SESSION_SECRET baru + password baru kedua akun (hash scrypt diperbarui, nilai hanya di .env) — verifikasi login ihsan/tantri 200, salah 401, session owner 200.
- DATA LAYER (src/server/*, semua ber-scope workspaceId = ekuivalen RLS): planner.ts (aktivitas preferensi, kejadian 4 status di ActivityLog + jam rencana di WeeklyPlanEntry sesuai skema, reschedule satu kejadian TANPA menyentuh preferensi, ensureWeekPlanned idempoten, energi 1–3); finance.ts (transaksi CRUD, kategori nonaktif- bukan hapus saat dipakai, ringkasan bulanan, alokasi 10/20/10/20/40 TERPISAH dari lensa 50/30/20, target + setor); reflection.ts (5 field refleksi per user/minggu, komentar, weekly review agregat + insight berbasis data); chat.ts (pesan + polling ?after=ISO).
- API 16 route di src/app/api/* lewat handle() — error bisnis → 400 manusiawi, 401 → pesan sesi, error teknis tidak pernah bocor.
- UI: today-section (tanggal, energi 3 tombol, agenda + aksi Selesai/Lewati/Pindah, drawer reschedule); planner-section (navigasi minggu, pemilih hari 7 kolom, aktivitas fleksibel, drawer aktivitas baru); finance-section (ringkasan 3 angka, drawer transaksi urutan jenis→nominal→kategori→tanggal→catatan dengan keyboard angka, kartu transaksi, filter+cari, panel alokasi & lensa dengan penjelasan terpisah, target + setor); reflection-section (data minggu dulu → refleksi 5 pertanyaan → refleksi pasangan → komentar berdua); chat-section (gelembung per pengirim, polling 3s, auto-scroll, input menempel safe-area). ui-bits.tsx: StatusBadge berlabel teks, EmptyState, Panel.
- Lib: dates.ts (minggu Senin, durasi manusiawi "1 jam 15 mnt", "sekitar 19:15"), client.ts (apiFetch + useApi), section-store.ts (diekstrak dari app-shell), format.ts + rupiah().
- Verifikasi: tsc bersih, eslint bersih, smoke test API 25/25 (termasuk reschedule kejadian done ditolak, alokasi ≠100 ditolak, nominal ≤0 ditolak, preferensi tak berubah setelah reschedule), data uji [SMOKE] dibersihkan, next build sukses (16 route).

Stage Summary:
- Fitur inti HIDUP: Today menjawab "hari ini ngapain aja", Planner dengan reschedule natural (preferensi ≠ kejadian), Buku Kas lengkap (transaksi/kategori/alokasi/target), Refleksi berdua + komentar, Chat polling.
- Weekly review + insight tersedia di payload refleksi; tampilan lanjutan + perbandingan mingguan menunggu arah fase berikutnya.
- Keamanan tetap: tanpa registrasi publik, semua query ber-scope workspace, data uji dibersihkan.

---
Task ID: Fase-4 (Weekly Review + Insight berbasis data)
Agent: Buffy (Freebuff)
Task: Weekly Review penuh — navigasi minggu, ringkasan akurat, durasi direncanakan-vs-aktual, review perpindahan & skipped, energi hati-hati, perbandingan keuangan dua minggu, insight transparan, refleksi + komentar — tanpa skor, tanpa gamifikasi, tanpa AI eksternal.

Work Log:
- Server (reflection.ts): definisi penghitungan dijelasin biar nggak dobel — kejadian lama yang udah dipindah (status "rescheduled") dianggap bagian dari kejadian tujuannya, jadi "planned" = rencana final; "dipindah" dihitung terpisah. moves = pasangan nyata (kejadian baru bawa rescheduledFrom + kejadian lama status rescheduled); skippedList = daftar kejadian dilewati; lowestEnergy = hari energi terendah + berapa kejadian dipindah di hari itu; durasi aktual hanya dihitung kalau memang dicatat (actualRecorded), nggak nyontek rencana. getFinanceTwoWeeks = SATU query rentang 14 hari lalu dibagi dua minggu (efisien, tanpa query per minggu). buildInsights: tiap kalimat bisa dilacak ke angkanya, pakai rupiah() dari format.ts (satu sumber kebenaran), bahasa korelasi hati-hati ("tercatat bersamaan, belum tentu sebab-akibat"), ada fallback "tidak ada pola yang cukup jelas".
- planner.ts: setOccurrenceStatus sekarang terima actualDurationMinutes (0–1440, integer) — durasi nyata dicatat pas aktivitas selesai.
- API: GET /api/reflection balikin finance dua minggu + reviewStatus ("not-started" | "done" — selesai kalau refleksi sendiri udah diisi); PATCH /api/occurrences terima actualDurationMinutes; POST /api/categories bisa terima bucket "income" buat kategori pemasukan (bug ketemu pas smoke test).
- UI reflection-section dirombak jadi REVIEW MINGGUAN: navigasi minggu (mundur/maju/"minggu ini", riwayat bisa dibuka), chip status review, urutan data→pola→refleksi: (1) ringkasan aktivitas + per aktivitas, (2) waktu direncanakan vs aktual + selisih dengan catatan netral, (3) daftar perpindahan & yang dilewati (tanpa nebak-nebab penyebab), (4) energi per orang (rata-rata, strip harian, catatan korelasi hati-hati), (5) keuangan minggu ini + banding minggu lalu bahasa netral, (6) "pola yang terlihat" — insight transparan, (7) refleksi 5 pertanyaan (semua opsional), (8) refleksi pasangan, (9) komentar. planner-section: tombol "Selesai" sekarang buka drawer durasi aktual (chip cepat + input manual, bisa skip) — Today tetap satu-tap biar cepat.
- Bug fix dari smoke test: (1) kategori income ditolak karena enum bucket kurang "income"; (2) format dobel minus "-Rp200.000 lebih rendah"; (3) kejadian rescheduled kehitung dobel di planned.
- Verifikasi: tsc & eslint bersih; smoke test Fase 4 18/18 (minggu penuh, reschedule, skipped, energi, transaksi dua arah, dua minggu perbandingan, status review, riwayat minggu lalu, minggu kosong tanpa NaN); data uji [P4] dibersihkan; next build sukses.

Stage Summary:
- Weekly Review hidup: angka akurat dari database, tiap insight bisa ditelusuri, tanpa skor produktivitas/gamifikasi/nasihat AI.
- Riwayat minggu bisa dibuka lewat navigasi; data shared vs personal ngikutin schema (review = personal, aktivitas+keuangan = workspace).
- Sengaja ditunda: transisi "minggu depan" interaktif (copy rencana/ubah target) — baru catatan refleksi; ekspor review; chart visual.
- Catatan: build standalone cp -r masih gagal di Windows (pre-existing, di luar cakupan).
