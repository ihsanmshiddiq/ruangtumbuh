// Klien Supabase sisi server.
//
// DUA klien dengan tanggung jawab berbeda — jangan tertukar:
//
// 1) createServerSupabase() — klien PENGGUNA (anon key + cookie sesi).
//    Semua query data berjalan lewat sini: RLS Supabase menegakkan
//    "hanya data workspace sendiri" di level DATABASE, bukan di kode.
//    Ini satu-satunya jalur yang dipakai di produksi.
//
// 2) createServiceSupabase() — klien SERVICE ROLE (kunci master).
//    Hanya untuk mode pratinjau lokal (AUTH_BYPASS=1): query dibuat atas
//    nama aplikasi dengan filter workspace eksplisit dari konteks sesi
//    tiruan. JANGAN PERNAH set SUPABASE_SERVICE_ROLE_KEY di Vercel.
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export type ServiceSupabase = SupabaseClient;

export function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

/** Klien pengguna: sesi dibaca/ditulis lewat cookie (RLS aktif). */
export async function createServerSupabase(): Promise<SupabaseClient> {
  const env = supabaseEnv();
  if (!env) throw new Error("Konfigurasi Supabase belum lengkap (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).");
  const store = await cookies();
  return createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options);
          }
        } catch {
          // Dipanggil dari Server Component → set cookie ditangani middleware.
        }
      },
    },
  });
}

let serviceClient: SupabaseClient | null = null;

/**
 * Klien service role — LOKAL SAJA (mode pratinjau). Null bila env tidak diset.
 * Produksi (Vercel): env ini sengaja tidak ada → selalu null.
 */
export function createServiceSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  serviceClient ??= createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return serviceClient;
}
