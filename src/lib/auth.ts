// Sesi login — produksi: Supabase Auth (sumber kebenaran kredensial).
//
// Alur identitas (setia pada desain RLS):
//   auth.getUser() → workspace_members → workspace → data.
// Kredensial TIDAK pernah disentuh aplikasi: email+password diverifikasi
// Supabase, aplikasi hanya menerima sesi yang sudah valid. Tidak ada tabel
// password, tidak ada jalur pendaftaran publik (signup dimatikan di Supabase).
//
// Mode pratinjau lokal (AUTH_BYPASS=1 + SUPABASE_SERVICE_ROLE_KEY): identitas
// anggota pertama workspace dipakai tanpa login agar UI bisa diuji cepat.
// Query data tetap lewat klien service role dengan filter eksplisit dari
// konteks ini. Produksi (Vercel): env ini sengaja tidak di-set → default aman.
import { createServerSupabase, createServiceSupabase, supabaseEnv, type ServiceSupabase } from "@/lib/supabase/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export type SessionContext = {
  authMode: "supabase" | "bypass";
  user: { id: string; email: string; displayName: string };
  workspace: {
    id: string;
    name: string;
    role: string; // "owner" | "partner" — diambil dari DB, bukan dari frontend
    members: { id: string; displayName: string; role: string }[];
  };
};

type DataClient = { user: SupabaseClient; service: ServiceSupabase | null };

type MemberJoin = {
  user_id: string;
  role: string;
  profiles: { display_name: string } | null;
};

type MembershipRow = {
  workspace_id: string;
  role: string;
};

/** Rangkai konteks dari userId + keanggotaan workspace-nya (satu pintu). */
async function buildContext(
  client: DataClient,
  userId: string,
  email: string,
  authMode: "supabase" | "bypass"
): Promise<SessionContext | null> {
  const db = authMode === "bypass" && client.service ? client.service : client.user;

  const { data: membership, error: mErr } = await db
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (mErr || !membership) return null;
  const mem = membership as MembershipRow;

  const [wsRes, membersRes] = await Promise.all([
    db.from("workspaces").select("id, name").eq("id", mem.workspace_id).maybeSingle(),
    db
      .from("workspace_members")
      .select("user_id, role, profiles ( display_name )")
      .eq("workspace_id", mem.workspace_id)
      .order("created_at", { ascending: true }),
  ]);
  const members = (membersRes.data ?? []) as unknown as MemberJoin[];
  if (!wsRes.data || membersRes.error || members.length === 0) return null;

  const mapped = members.map((m) => ({
    id: m.user_id,
    displayName: m.profiles?.display_name ?? "Anggota",
    role: m.role,
  }));
  const me = mapped.find((m) => m.id === userId);

  return {
    authMode,
    user: { id: userId, email, displayName: me?.displayName ?? "Anggota" },
    workspace: {
      id: mem.workspace_id,
      name: (wsRes.data as { name: string }).name,
      role: mem.role,
      members: mapped,
    },
  };
}

/** Konteks dari sesi Supabase valid, atau null. Mode pratinjau lokal opsional. */
export async function getMembershipContext(): Promise<SessionContext | null> {
  if (!supabaseEnv()) return null;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return buildContext({ user: supabase, service: null }, user.id, user.email ?? "", "supabase");
  }

  // Mode pratinjau lokal — tidak pernah aktif di produksi (env tidak diset).
  if (process.env.AUTH_BYPASS === "1") {
    const service = createServiceSupabase();
    if (service) {
      const { data: first } = await service
        .from("workspace_members")
        .select("user_id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (first) {
        const { data: prof } = await service
          .from("profiles")
          .select("display_name")
          .eq("id", (first as { user_id: string }).user_id)
          .maybeSingle();
        return buildContext(
          { user: supabase, service },
          (first as { user_id: string }).user_id,
          "preview@lokal",
          "bypass"
        );
      }
    }
  }

  return null;
}

/**
 * Verifikasi kredensial lewat Supabase Auth + terbitkan cookie sesi.
 * Mengembalikan false bila gagal (pesan di route selalu generik).
 */
export async function login(email: string, password: string): Promise<boolean> {
  if (!supabaseEnv()) return false;
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

/** Hapus sesi (cookie Supabase dibersihkan oleh signOut). */
export async function logout(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
}

export type { User };
