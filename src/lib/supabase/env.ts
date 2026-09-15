// Nama environment Supabase — menerima beberapa nama umum sekaligus.
//
// Latar: integrasi resmi Supabase↔Vercel menyuntikkan variabel dengan nama
// NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_URL (gaya baru), sementara
// panduan lama memakai NEXT_PUBLIC_SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_URL.
// Isinya sama — kunci PUBLIK yang aman untuk client. Selisih nama tidak boleh
// membuat login gagal diam-diam, jadi semua nama umum diterima di satu tempat.
export function supabaseEnv(): { url: string; key: string } | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    "";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    "";
  if (!url || !key) return null;
  return { url, key };
}
