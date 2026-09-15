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

/**
 * Nama tampilan anggota workspace — DUA QUERY TERPISAH.
 *
 * PENTING: jangan pakai embed PostgREST "workspace_members → profiles":
 * keduanya tidak punya foreign key langsung (sama-sama menunjuk auth.users),
 * jadi PostgREST menolak: "Could not find a relationship ... in the schema
 * cache". Kegagalan senyap ini membuat gerbang login menolak sesi valid.
 * Policy RLS profiles sudah mengizinkan baca profil rekan satu workspace.
 */
export async function memberNameMap(
  sb: SupabaseClient,
  workspaceId: string
): Promise<Map<string, string>> {
  const members = unwrap(
    await sb.from("workspace_members").select("user_id").eq("workspace_id", workspaceId)
  ) as unknown as { user_id: string }[];
  const ids = members.map((m) => m.user_id);
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const profiles = unwrap(
    await sb.from("profiles").select("id, display_name").in("id", ids)
  ) as unknown as { id: string; display_name: string }[];
  const byId = new Map(profiles.map((p) => [p.id, p.display_name]));
  for (const id of ids) map.set(id, byId.get(id) ?? "Anggota");
  return map;
}
