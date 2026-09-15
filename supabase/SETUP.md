# Ruang Tumbuh — Panduan Deploy Produksi (Supabase + Vercel)

Dokumen ini panduan langkah demi langkah untuk membawa Ruang Tumbuh dari sandbox
(Next.js + SQLite/Prisma) ke jalur produksi yang sesungguhnya: Supabase sebagai
database + autentikasi, frontend di-deploy ke Vercel.

Ini aplikasi privat untuk dua orang. Tidak ada pendaftaran publik, tidak ada
peran lain selain `owner` dan `partner`. Semua langkah di bawah bisa
diselesaikan dalam satu duduk, sekitar 30-45 menit.

Dua hal yang tidak boleh dilanggar sepanjang proses:

- Password kedua user tidak pernah ditulis ke source code, GitHub, atau chat.
- Kunci `service_role` tidak pernah dipakai di frontend, tidak pernah masuk Git.

Prasyarat: akun GitHub (repo frontend), akun Supabase, akun Vercel.
File yang dipakai dari repo ini: `supabase/schema.sql`.

---

## 1. Membuat project Supabase

1. Buka https://supabase.com dan masuk (login dengan GitHub juga bisa).
2. Klik **New project**. Isi:
   - **Name**: `ruang-tumbuh`
   - **Database Password**: buat yang kuat dan simpan di password manager
     (jarang dipakai sehari-hari, tapi wajib tersimpan).
   - **Region**: pilih yang terdekat (mis. Singapore).
   - Paket Free cukup untuk aplikasi dua orang ini.
3. Tunggu provisioning selesai (sekitar 2 menit).
4. Catat dua nilai dari **Project Settings → API**:
   - **Project URL** — contoh: `https://abcdefgh.supabase.co`
   - **anon public key** — kunci panjang pada kolom `anon public`.

Catatan penting: kunci `anon public` aman dipakai di browser — ia hanya
mengaktifkan akses yang sudah diizinkan kebijakan RLS. Kunci `service_role`
berbeda: ia melewati seluruh RLS. Jangan pernah dipakai di frontend, jangan
pernah di-commit, jangan pernah dikirim lewat chat.

## 2. Mengaktifkan Email/Password dan mematikan pendaftaran publik

1. Buka **Authentication → Providers** (di beberapa versi dashboard:
   **Authentication → Sign In / Providers**) → pilih **Email** → pastikan
   statusnya **Enabled** (ini metode login kita: email + password).
2. Di provider Email yang sama, **matikan** opsi **"Allow new users to sign
   up"**. Dengan ini tidak ada orang luar yang bisa mendaftar sendiri, meski
   mengetahui URL project.
3. Untuk kesederhanaan, matikan juga konfirmasi email (**Authentication →
   Sign In / Up** → matikan **Confirm email**) supaya login langsung berhasil
   tanpa langkah verifikasi. Ini bisa diaktifkan kembali kapan saja.
4. Klik **Save**.

## 3. Membuat TEPAT DUA user

1. Buka **Authentication → Users** → **Add user** → **Create new user**.
2. Isi email dan password (minimal 8 karakter; disarankan panjang dan unik),
   centang **Auto Confirm User** supaya user langsung aktif.
3. Buat tepat dua akun:
   - Akun pemilik — nanti berperan `owner`.
   - Akun pasangan — nanti berperan `partner`.
4. Tekanan penting: password ini **tidak pernah** ditulis ke source code, file
   `.env` yang di-commit, GitHub, atau chat. Simpan di password manager. Kalau
   suatu saat perlu diganti, pakai alur reset di bagian 10 atau ubah langsung
   lewat dashboard.

Kedua user inilah yang nantinya menjadi satu-satunya penghuni workspace.

## 4. Menjalankan schema.sql

1. Buka **SQL Editor** → **New query**.
2. Salin **seluruh isi** `supabase/schema.sql` ke editor, lalu klik **Run**.
   Hasil yang benar: `Success. No rows returned`.
3. Verifikasi: buka **Table Editor** — seharusnya ada 14 tabel:
   `profiles`, `workspaces`, `workspace_members`, `activities`,
   `activity_logs`, `weekly_plan_entries`, `energy_logs`,
   `weekly_reflections`, `comments`, `messages`, `transaction_categories`,
   `transactions`, `allocation_plans`, `financial_targets`.

Schema ini juga memasang trigger `on_auth_user_created` yang membuat baris
`profiles` otomatis setiap ada user baru. Namun trigger hanya berlaku untuk
user yang dibuat **setelah** schema dijalankan. Dua user dari langkah 3 dibuat
sebelumnya — profil mereka dibuat lewat query backfill di langkah 5a.

## 5. Menemukan UUID user dan membuat workspace + keanggotaan

Semua langkah di bagian ini dijalankan di **SQL Editor**. Ini memang disengaja:
pembuatan workspace dan keanggotaan tidak punya jalur dari frontend, sehingga
hanya bisa dilakukan dari sini (postgres melewati RLS).

**5a–5c. Backfill profil + workspace + keanggotaan (SUDAH TERISI OTOMATIS):**

File **`supabase/backfill.local.sql`** (lokal, tidak di-commit) sudah berisi UUID
dua user dan siap dijalankan langsung:

1. Buka isi file `supabase/backfill.local.sql`
2. Tempel seluruh isinya ke **SQL Editor** → **Run**
3. Bagian verifikasi di akhir harus menampilkan 2 baris: `owner` (Ihsan) dan
   `partner` (Tantri)

> Ingin menulis manual? Template query-nya ada di bawah.

```sql
insert into public.profiles (id, display_name)
select u.id, split_part(u.email, '@', 1)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
```

**5d. Verifikasi:**

Query verifikasi sudah ada di akhir `backfill.local.sql`. Atau manual:

```sql
select wm.role, u.email
from public.workspace_members wm
join auth.users u on u.id = wm.user_id;
```

Hasil yang benar: dua baris — `owner` dengan email pemilik, `partner` dengan
email pasangan. Selesai. Database siap dipakai.

## 6. Environment variables frontend

Frontend hanya butuh dua variabel.

Untuk Next.js (App Router):

```
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key dari langkah 1>
```

Untuk Vite (React):

```
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key dari langkah 1>
```

- Di komputer lokal: taruh di `.env.local` yang tidak ikut di-commit
  (pastikan `.gitignore` memuat `.env*.local`).
- Di produksi: set di Vercel — **Project → Settings → Environment Variables**
  (detail di langkah 8).

Kenapa hanya `anon key` yang boleh dipakai di browser: kunci itu adalah
identitas "project", bukan identitas "orang". Siapa pun boleh memilikinya,
karena keamanan baris data justru ditegakkan RLS di database (bagian 9).
`service_role` sebaliknya: ia melewati semua kebijakan RLS, sehingga satu
kebocoran berarti seluruh database terbaca. Karena itu `service_role` hanya
untuk skrip di server yang dipercaya — tidak pernah di frontend, tidak pernah
di Git.

## 7. Site URL dan Redirect URLs

Buka **Authentication → URL Configuration**:

- **Site URL**: domain produksi, misalnya `https://ruang-tumbuh.vercel.app`
  (atau domain kustom jika ada).
- **Redirect URLs**: tambahkan keduanya:
  - `https://<domain-produksi>/**`
  - `http://localhost:3000/**` untuk Next.js, atau `http://localhost:5173/**`
    untuk Vite — untuk pengembangan lokal.

Ini penting untuk alur autentikasi berbasis browser (misalnya reset password di
bagian 10): Supabase menolak mengarahkan pengguna ke URL yang tidak terdaftar
di daftar ini.

## 8. Deploy ke Vercel

1. Pastikan repo GitHub berisi kode frontend final. Periksa dua hal:
   `.env.local` **tidak** ikut ter-commit, dan `supabase/schema.sql` boleh
   di-commit (file itu tidak memuat rahasia apa pun).
2. Buka vercel.com → **Add New… → Project** → import repo GitHub.
3. Framework Preset terdeteksi otomatis (Next.js atau Vite). Biarkan build
   command dan output default.
4. Di bagian **Environment Variables**, tambahkan dua variabel dari langkah 6
   untuk semua environment (Production, Preview, Development).
5. Klik **Deploy** dan tunggu selesai. Catat domain yang diberikan, misalnya
   `https://<nama-project>.vercel.app`.
6. Kembali ke langkah 7: masukkan domain itu ke **Site URL** dan
   **Redirect URLs** di Supabase.
7. Uji dari browser: login dengan akun pemilik. Tidak ada halaman registrasi;
   data yang muncul adalah data workspace. Lalu coba login dengan akun
   pasangan dari perangkat lain — keduanya melihat workspace yang sama.

## 9. Bagaimana RLS melindungi data

Setiap tabel di schema diaktifkan **Row Level Security**. Setiap permintaan dari
browser membawa token login; Supabase menjalankan query seolah-olah oleh user
tersebut, dan `auth.uid()` adalah id user yang sedang login. Kebijakannya satu
rantai yang sama untuk semua tabel:

```
auth.uid() → workspace_members (user_id = auth.uid()) → workspace_id → baris
```

Artinya: sebuah baris hanya boleh dibaca atau ditulis bila ada baris di
`workspace_members` yang menghubungkan user yang sedang login dengan workspace
tempat baris itu berada. Konsekuensi praktisnya:

- Pemilik dan pasangan saling melihat seluruh data satu workspace — memang itu
  tujuannya.
- Siapa pun di luar workspace — bahkan jika suatu saat ada user lain — melihat
  nol baris. Bukan "baris milik orang lain yang disembunyikan UI", melainkan
  benar-benar tidak ada yang dikirim database.
- Operasi yang tidak diberi kebijakan (misalnya membuat workspace atau
  menambah membership dari API) ditolak secara default. Itu hanya bisa
  dilakukan dari SQL Editor — seperti yang sudah dilakukan di langkah 5.

Karena itu frontend tidak boleh dipercaya, dan tidak perlu dipercaya: tidak
ada validasi di browser yang bersifat keamanan. Semua keputusan "siapa boleh
apa" dieksekusi di database, di luar jangkauan siapa pun yang membongkar
JavaScript aplikasi. Satu-satunya disiplin yang tetap di tangan manusia:
kunci `service_role` tidak pernah keluar dari server.

## 10. Reset password (opsional)

Untuk dua orang, ada dua jalan — pilih salah satu.

**Jalan A — lewat aplikasi (alur standar Supabase):**

1. **Authentication → Providers → Email**: pastikan reset password aktif.
   Template emailnya ada di **Authentication → Emails** (pola "Reset
   Password").
2. Aplikasi memanggil
   `supabase.auth.resetPasswordForEmail(email, { redirectTo:
   '<Site URL>/update-password' })`; pengguna membuka tautan dari email lalu
   menetapkan password baru. Halaman tujuan reset harus terdaftar di
   **Redirect URLs** (langkah 7).
3. Catatan: SMTP bawaan Supabase punya batas pengiriman. Untuk dua orang yang
   jarang reset, itu cukup. Kalau ingin lebih andal, pasang SMTP kustom di
   **Project Settings → Authentication → SMTP**.

**Jalan B — manual lewat dashboard (paling sederhana):**

- **Authentication → Users** → pilih user → menu titik tiga → **Send password
  recovery**, atau langsung setel password baru di tempat. Tanpa konfigurasi
  tambahan, dan untuk dua orang biasanya sudah memadai.

---

## Checklist akhir

- [ ] Project Supabase dibuat; Project URL + anon key tercatat
- [ ] Email provider aktif; pendaftaran publik dimatikan
- [ ] TEPAT DUA user dibuat; password tersimpan di password manager
- [ ] `schema.sql` sukses dijalankan; 14 tabel terlihat di Table Editor
- [ ] 1 workspace + 2 workspace_members (owner, partner) terbentuk
- [ ] Environment variables terpasang di lokal dan Vercel (hanya anon key)
- [ ] Site URL + Redirect URLs memuat domain produksi dan localhost
- [ ] Deploy Vercel sukses; login owner dan partner berhasil dari dua perangkat
- [ ] Satu transaksi uji dan satu log aktivitas uji terlihat di kedua perangkat

Kalau semua kotak tercentang, Ruang Tumbuh resmi tinggal di rumah barunya.
Jalan boleh berubah. Arah jangan.
