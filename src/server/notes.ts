// Data layer server-only: catatan pribadi & dibagikan.
// SEMUA query difilter workspaceId — ekuivalen RLS di sandbox SQLite.
// Aturan visibilitas ditegakkan DI SINI (server), bukan di frontend:
//   private = hanya penulis; shared = penulis + sesama anggota workspace.
// Identitas penulis SELALU dari sesi (ctx.user.id) — tidak pernah dari input.
import { db } from "@/lib/db";
import type { SessionContext } from "@/lib/types";

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

/** Daftar note yang boleh dilihat user saat ini: miliknya (semua) + shared partner. */
export async function listNotes(ctx: Ctx): Promise<NoteDTO[]> {
  const rows = await db.note.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      OR: [{ authorId: ctx.user.id }, { visibility: "shared" }],
    },
    orderBy: { updatedAt: "desc" },
  });
  const nameById = new Map(ctx.workspace.members.map((m) => [m.id, m.displayName]));
  return rows.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    visibility: n.visibility === "shared" ? "shared" : "private",
    authorId: n.authorId,
    authorName: nameById.get(n.authorId) ?? "Anggota",
    mine: n.authorId === ctx.user.id,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  }));
}

export async function createNote(
  ctx: Ctx,
  input: { title: string; content: string; visibility: "private" | "shared" },
): Promise<NoteDTO> {
  const title = input.title.trim();
  if (!title) throw new Error("Judul catatan tidak boleh kosong.");
  if (title.length > NOTE_LIMITS.titleMax) throw new Error(`Judul maksimal ${NOTE_LIMITS.titleMax} karakter.`);
  if (input.content.length > NOTE_LIMITS.contentMax) throw new Error(`Isi catatan maksimal ${NOTE_LIMITS.contentMax} karakter.`);
  const row = await db.note.create({
    data: {
      workspaceId: ctx.workspace.id,
      authorId: ctx.user.id, // dari sesi — bukan dari frontend
      title,
      content: input.content,
      visibility: input.visibility === "shared" ? "shared" : "private",
    },
  });
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    visibility: row.visibility === "shared" ? "shared" : "private",
    authorId: row.authorId,
    authorName: ctx.user.displayName,
    mine: true,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Update note milik sendiri. Return null bila note bukan miliknya/tidak ada. */
export async function updateNote(
  ctx: Ctx,
  id: string,
  input: { title: string; content: string; visibility: "private" | "shared" },
): Promise<{ ok: boolean; error?: string }> {
  const existing = await db.note.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
  });
  if (!existing || existing.authorId !== ctx.user.id) {
    return { ok: false, error: "Catatan tidak ditemukan atau bukan milikmu." };
  }
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Judul catatan tidak boleh kosong." };
  if (title.length > NOTE_LIMITS.titleMax) return { ok: false, error: `Judul maksimal ${NOTE_LIMITS.titleMax} karakter.` };
  if (input.content.length > NOTE_LIMITS.contentMax) return { ok: false, error: `Isi catatan maksimal ${NOTE_LIMITS.contentMax} karakter.` };
  await db.note.update({
    where: { id: existing.id },
    data: {
      title,
      content: input.content,
      visibility: input.visibility === "shared" ? "shared" : "private",
    },
  });
  return { ok: true };
}

/** Hapus note milik sendiri. Return false bila bukan miliknya/tidak ada. */
export async function deleteNote(ctx: Ctx, id: string): Promise<boolean> {
  const existing = await db.note.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
  });
  if (!existing || existing.authorId !== ctx.user.id) return false;
  await db.note.delete({ where: { id: existing.id } });
  return true;
}
