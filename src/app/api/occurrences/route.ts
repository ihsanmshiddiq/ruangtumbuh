// PATCH /api/occurrences  { id, status }        → tandai done/skipped/kembali planned
// POST   /api/occurrences  { activityId, date } → tambah kejadian ad-hoc di tanggal
import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/server/api";
import { requireContext } from "@/server/context";
import { setOccurrenceStatus, ensureOccurrence, getActivity } from "@/server/planner";
import { isISODate } from "@/lib/dates";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["planned", "done", "skipped"]),
  // Durasi aktual opsional saat menandai selesai (menit, 0–1440).
  actualDurationMinutes: z.number().int().min(0).max(1440).nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireContext();
    const body = patchSchema.parse(await req.json());
    const ok = await setOccurrenceStatus(ctx, body.id, body.status, body.actualDurationMinutes);
    if (!ok) return { error: "Kejadian tidak ditemukan." };
    return { ok: true };
  });
}

const postSchema = z.object({
  activityId: z.string().min(1),
  date: z.string().refine(isISODate, "Tanggal tidak valid."),
});

export async function POST(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireContext();
    const body = postSchema.parse(await req.json());
    const activity = await getActivity(ctx, body.activityId);
    if (!activity) return { error: "Aktivitas tidak ditemukan." };
    const id = await ensureOccurrence(ctx, {
      activityId: body.activityId,
      date: body.date,
      plannedStartTime: activity.preferredStartTime,
      plannedDurationMinutes: activity.estimatedDurationMinutes,
    });
    return { id };
  });
}
