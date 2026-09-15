// Helper data layer: klien Supabase sesuai mode konteks + pembungkus error.
// Mode sesi   → klien pengguna (RLS Supabase menegakkan batas workspace).
// Mode pratinjau (lokal) → klien service role, filter tetap eksplisit.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionContext } from "@/lib/types";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";

export async function getSupabaseFor(ctx: SessionContext): Promise<SupabaseClient> {
  if (ctx.authMode === "bypass") {
    const service = createServiceSupabase();
    if (service) return service;
  }
  return createServerSupabase();
}

/** Query gagal → lempar; pesan mentah tidak pernah sampai ke pengguna (api.ts). */
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Ubah timestamp Postgres (ISO) ke ISOUTC normal untuk DTO. */
export function iso(value: string): string {
  return new Date(value).toISOString();
}
