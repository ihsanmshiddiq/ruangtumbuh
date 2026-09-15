// GET  /api/notes → catatan yang boleh dilihat (milik sendiri + shared)
// POST /api/notes → buat catatan (author selalu dari sesi)
import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/server/api";
import { requireContext } from "@/server/context";
import { listNotes, createNote, NOTE_LIMITS } from "@/server/notes";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().trim().min(1, "Judul catatan tidak boleh kosong.").max(NOTE_LIMITS.titleMax),
  content: z.string().max(NOTE_LIMITS.contentMax).default(""),
  visibility: z.enum(["private", "shared"]).default("private"),
});

export async function GET() {
  return handle(async () => {
    const ctx = await requireContext();
    return { notes: await listNotes(ctx) };
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireContext();
    const body = createSchema.parse(await req.json());
    return { note: await createNote(ctx, body) };
  });
}
