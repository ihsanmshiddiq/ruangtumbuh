# Ruang Tumbuh

Ruang pribadi bersama untuk **dua orang** — merencanakan, menjalani, mencatat, merefleksikan, dan saling memahami. Bukan aplikasi produktivitas generik: tanpa skor, tanpa gamifikasi, tanpa feed sosial.

> Dibangun untuk penggunaan privat (satu workspace, dua anggota). Repo ini berisi source code saja — **tidak ada data pengguna di dalamnya**.

## Fitur

- **Hari Ini** — agenda hari ini, energi, aksi cepat (selesai / lewati / pindah / tidak-bisa-dilakukan)
- **Perencana** — rencana mingguan dari preferensi berulang; memindahkan satu kejadian tidak mengubah preferensi
- **Buku Kas** — transaksi berdua, kategori, alokasi pemasukan ber-pos bebas (total 100%), lensa 50/30/20, dana target
- **Refleksi / Review Mingguan** — data dulu, baru refleksi; perbandingan minggu; tanpa penghakiman
- **Notes** — catatan pribadi atau dibagikan ke pasangan (private / shared, ditegakkan di level database)
- **Pesan** — percakapan pribadi dua orang
- **PWA** — installable; data privat tidak pernah di-cache service worker
- **Backup & Pulihkan** — ekspor JSON lengkap; impor dua langkah dengan validasi ketat (hanya menambah, tidak pernah menghapus)

## Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- Sandbox lokal: Prisma + SQLite (pola query identik dengan produksi)
- Produksi: [Supabase](https://supabase.com) (Auth + PostgreSQL + **RLS sebagai satu-satunya batas keamanan**) + Vercel

## Menjalankan lokal

```bash
bun install
cp .env.example .env   # isi nilai sesuai kebutuhanmu
bun run dev
```

Buka http://localhost:3000. Akun dibuat lewat seed lokal — tidak ada registrasi publik.

## Setup Supabase (produksi)

Lihat [supabase/SETUP.md](supabase/SETUP.md). Ringkas:

1. Buat project Supabase, jalankan `supabase/schema.sql` di SQL Editor
2. Buat 2 user di Authentication (matikan *email signup* — tidak ada pendaftaran publik)
3. Jalankan backfill workspace (pola ada di schema; jangan commit UUID/nilai aslimu)
4. Set env di Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (hanya credential yang aman untuk client)

## Keamanan — prinsip

> *Source code boleh diketahui publik. Data pribadi dan akses pengguna tidak boleh.*

- Frontend bukan batas keamanan — semua otorisasi ditegakkan di database (RLS) / data layer server
- Identitas penulis selalu dari sesi terautentikasi, tidak pernah dari input client
- Pesan bersifat append-only; note private partner tidak bisa dibaca/sunting/dihapus
- Service worker hanya meng-cache aset statis; `/api/*` selalu lewat jaringan
- Backup tidak memuat credential; ekspor menghormati visibilitas (note private partner tidak ikut)

## Struktur

```
src/app/            route & API handlers
src/server/         data layer ber-scope workspace (server-only)
src/components/     UI (sections, shell, planner, settings)
supabase/           schema.sql + migrations (urut: 001, 002, 003)
scripts/            smoke test & utilitas dev
```

## Skrip

```bash
bun run dev        # dev server
bun run build      # build produksi
bun run lint       # eslint
bunx tsc --noEmit  # typecheck
```

## Lisensi

Privat — diperuntukkan bagi penulisnya. Jika mempublikasikan repo ini, mohon hormati privasi penggunanya: jangan pernah menyertakan data, kredensial, atau identitas asli.
