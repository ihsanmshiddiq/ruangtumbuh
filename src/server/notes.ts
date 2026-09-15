// Data layer server-only: catatan pribadi & dibagikan.
// Semua query lewat klien pengguna — RLS Supabase menegakkan visibilitas:
//   private = hanya penulis; shared = penulis + sesama anggota workspace.
// Filter OR di bawah adalah lapisan kedua (RLS tetap garis pertahanan utama).
// Identitas penulis SELALU dari sesi (ctx.user.id) — tidak pernah dari input.
import type { SessionContext } from "@/lib/types";
import { getSupabaseFor, iso, unwrap } from "@/server/db";

type Ctx = SessionContext;

export type NoteDTO = {
  id: string;
  title: string;
  content: string;
  visibility: "private" | "shared";
  authorId: string;
  authorName: string;
  mine: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

export const NOTE_LIMITS = {
  titleMax: 120,
  contentMax: 20000,
};

type NoteRow = {
  id: string;
  author_id: string;
  title: string;
  content: string;
  visibility: string;
  created_at: string;
  updated_at: string;
};

function toDTO(ctx: Ctx, n: NoteRow, nameById: Map<string, string>): NoteDTO {
  return {
    id: n.id,
    title: n.title,
    content: n.content,
    visibility: n.visibility === "shared" ? "shared" : "private",
    authorId: n.author_id,
    authorName: nameById.get(n.author_id) ?? "Anggota",
    mine: n.author_id === ctx.user.id,
    createdAt: iso(n.created_at),
    updatedAt: iso(n.updated_at),
  };
}

/** Daftar note yang boleh dilihat user saat ini: miliknya (semua) + shared partner. */
export async function listNotes(ctx: Ctx): Promise<NoteDTO[]> {
  const sb = await getSupabaseFor(ctx);
  const nameById = new Map(ctx.workspace.members.map((m) => [m.id, m.displayName]));
  const rows = unwrap(
    await sb
      .from("notes")
      .select("id, author_id, title, content, visibility, created_at, updated_at")
      .eq("workspace_id", ctx.workspace.id)
      .or(`author_id.eq.${ctx.user.id},visibility.eq.shared`)
      .order("updated_at", { ascending: false })
  ) as NoteRow[];
  return rows.map((n) => toDTO(ctx, n, nameById));
}

export async function createNote(
  ctx: Ctx,
  input: { title: string; content: string; visibility: "private" | "shared" }
): Promise<NoteDTO> {
  const title = input.title.trim();
  if (!title) throw new Error("Judul catatan tidak boleh kosong.");
  if (title.length > NOTE_LIMITS.titleMax) throw new Error(`Judul maksimal ${NOTE_LIMITS.titleMax} karakter.`);
  if (input.content.length > NOTE_LIMITS.contentMax) throw new Error(`Isi catatan maksimal ${NOTE_LIMITS.contentMax} karakter.`);
  const sb = await getSupabaseFor(ctx);
  const row = unwrap(
    await sb
      .from("notes")
      .insert({
        workspace_id: ctx.workspace.id,
        author_id: ctx.user.id, // dari sesi — RLS menegakkan juga
        title,
        content: input.content,
        visibility: input.visibility === "shared" ? "shared" : "private",
      })
      .select("id, author_id, title, content, visibility, created_at, updated_at")
      .single()
  ) as NoteRow;
  return toDTO(ctx, row, new Map([[ctx.user.id, ctx.user.displayName]]));
}

/** Update note milik sendiri. Return error manusiawi bila bukan miliknya. */
export async function updateNote(
  ctx: Ctx,
  id: string,
  input: { title: string; content: string; visibility: "private" | "shared" }
): Promise<{ ok: boolean; error?: string }> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Judul catatan tidak boleh kosong." };
  if (title.length > NOTE_LIMITS.titleMax) return { ok: false, error: `Judul maksimal ${NOTE_LIMITS.titleMax} karakter.` };
  if (input.content.length > NOTE_LIMITS.contentMax) return { ok: false, error: `Isi catatan maksimal ${NOTE_LIMITS.contentMax} karakter.` };
  const sb = await getSupabaseFor(ctx);
  // Update terikat author_id + workspace — RLS menegakkan hal yang sama.
  const rows = unwrap(
    await sb
      .from("notes")
      .update({
        title,
        content: input.content,
        visibility: input.visibility === "shared" ? "shared" : "private",
      })
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .eq("author_id", ctx.user.id)
      .select("id")
  ) as { id: string }[];
  if (rows.length === 0) return { ok: false, error: "Catatan tidak ditemukan atau bukan milikmu." };
  return { ok: true };
}

/** Hapus note milik sendiri. Return false bila bukan miliknya/tidak ada. */
export async function deleteNote(ctx: Ctx, id: string): Promise<boolean> {
  const sb = await getSupabaseFor(ctx);
  const rows = unwrap(
    await sb
      .from("notes")
      .delete()
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .eq("author_id", ctx.user.id)
      .select("id")
  ) as { id: string }[];
  return rows.length > 0;
}
