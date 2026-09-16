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

type MembershipRow = {
  workspace_id: string;
  role: string;
};

/**
 * Pesan ramah untuk kegagalan login Supabase — jujur tanpa bocor detail:
 * - invalid_credentials → kredensial memang salah
 * - email_not_confirmed → akun ada, tapi email belum dikonfirmasi
 * - RLS violation → kredensial BENAR, tapi setup data (members/workspace)
 *   belum lengkap — auth berhasil lalu policy menolak pembuatan sesi.
 *   Ini persis gejala "benar tapi tidak terjadi apa-apa" yang dilaporkan.
 */
function friendlyAuthError(code: string | undefined, message: string | undefined): string {
  const msg = message ?? "";
  if (code === "invalid_credentials" || /invalid login credentials/i.test(msg))
    return "Email atau kata sandi salah.";
  if (code === "email_not_confirmed" || /email not confirmed/i.test(msg))
    return "Email belum dikonfirmasi. Buka link konfirmasi dari Supabase dulu, ya.";
  if (/row-level security/i.test(msg))
    return "Akun ditemukan, tapi setup workspace belum lengkap (RLS menolak pembuatan sesi). Cek langkah 5 di supabase/SETUP.md — hubungkan kedua user ke workspace.";
  return "Gagal masuk. Coba lagi.";
}

/** Rangkai konteks dari userId + keanggotaan workspace-nya (satu pintu). */
async function buildContext(
  client: DataClient,
  userId: string,
  email: string,
  authMode: "supabase" | "bypass"
): Promise<SessionContext | null> {
  const db = authMode === "bypass" && client.service ? client.service : client.user;

  // limit(1): tahan bila langkah 5 SETUP.md tak sengaja dijalankan dua kali
  // (user masuk dua workspace) — mungkinSingle() malah error → loop login.
  const { data: membershipRows, error: mErr } = await db
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (mErr || !membershipRows || membershipRows.length === 0) return null;
  const mem = membershipRows[0] as MembershipRow;

  const [wsRes, membersRes] = await Promise.all([
    db.from("workspaces").select("id, name").eq("id", mem.workspace_id).maybeSingle(),
    db
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", mem.workspace_id)
      .order("created_at", { ascending: true }),
  ]);
  const memberRows = (membersRes.data ?? []) as unknown as { user_id: string; role: string }[];
  if (!wsRes.data || membersRes.error || memberRows.length === 0) return null;

  // Nama profil diambil lewat query TERPISAH: workspace_members dan profiles
  // tidak punya foreign key langsung (sama-sama menunjuk auth.users), jadi
  // embed PostgREST "profiles ( display_name )" gagal dengan "Could not find
  // a relationship ... in the schema cache" — penyebab login valid ditolak
  // diam-diam. Policy RLS profiles mengizinkan baca profil rekan workspace.
  const { data: profileRows } = await db
    .from("profiles")
    .select("id, display_name")
    .in("id", memberRows.map((m) => m.user_id));
  const nameById = new Map(
    ((profileRows ?? []) as unknown as { id: string; display_name: string }[]).map(
      (p) => [p.id, p.display_name]
    )
  );

  const mapped = memberRows.map((m) => ({
    id: m.user_id,
    displayName: nameById.get(m.user_id) ?? "Anggota",
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
 * - Klien @supabase/ssr otomatis menulis cookie sesi saat sign-in sukses.
 * - Setelah sign-in sukses, cek keanggotaan seperti gerbang halaman: bila
 *   user belum dihubungkan ke workspace (langkah 5 SETUP.md dilewati),
 *   sesi dibatalkan dan pesan arahan yang jelas dikembalikan.
 * Gagal → throw Error dengan pesan ramah; route yang menampilkan ke UI.
 */
export async function login(email: string, password: string): Promise<boolean> {
  if (!supabaseEnv()) throw new Error("Konfigurasi server belum lengkap. Hubungi pemilik aplikasi.");
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendlyAuthError((error as { code?: string }).code, error.message));

  // signInWithPassword sudah mengembalikan user tervalidasi. Memakainya di
  // sini menghindari satu round-trip auth tambahan sebelum redirect dashboard.
  const user = data.user;
  if (user) {
    const { data: memberships } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1);
    if (!memberships || memberships.length === 0) {
      await supabase.auth.signOut();
      throw new Error(
        "Akun valid, tapi belum terhubung ke workspace. Jalankan langkah 5 di supabase/SETUP.md (hubungkan kedua user ke workspace), lalu coba lagi."
      );
    }
  }
  return true;
}

/** Hapus sesi (cookie Supabase dibersihkan oleh signOut). */
export async function logout(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
}

export type { User };
