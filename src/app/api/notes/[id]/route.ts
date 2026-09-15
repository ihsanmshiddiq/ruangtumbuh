// PATCH  /api/notes/[id] → sunting catatan MILIK SENDIRI
// DELETE /api/notes/[id] → hapus catatan MILIK SENDIRI
// Server menolak menyentuh note orang lain — bukan cuma disembunyikan UI.
import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/server/api";
import { requireContext } from "@/server/context";
import { updateNote, deleteNote, NOTE_LIMITS } from "@/server/notes";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  title: z.string().trim().min(1, "Judul catatan tidak boleh kosong.").max(NOTE_LIMITS.titleMax),
  content: z.string().max(NOTE_LIMITS.contentMax).default(""),
  visibility: z.enum(["private", "shared"]).default("private"),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireContext();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const result = await updateNote(ctx, id, body);
    if (!result.ok) return { error: result.error };
    return { ok: true };
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireContext();
    const { id } = await params;
    const ok = await deleteNote(ctx, id);
    if (!ok) return { error: "Catatan tidak ditemukan atau bukan milikmu." };
    return { ok: true };
  });
}
