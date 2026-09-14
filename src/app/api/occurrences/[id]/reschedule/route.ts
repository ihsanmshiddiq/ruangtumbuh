// POST /api/occurrences/:id/reschedule { date, plannedStartTime }
// Memindahkan SATU kejadian — preferensi berulang tidak pernah tersentuh.
import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/server/api";
import { requireContext } from "@/server/context";
import { rescheduleOccurrence } from "@/server/planner";
import { isISODate } from "@/lib/dates";

export const dynamic = "force-dynamic";

const schema = z.object({
  date: z.string().refine(isISODate, "Tanggal tujuan tidak valid."),
  plannedStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam HH:MM.").nullable(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireContext();
    const { id } = await params;
    const body = schema.parse(await req.json());
    const result = await rescheduleOccurrence(ctx, id, body);
    if (!result.ok) return { error: result.error };
    return { ok: true };
  });
}
