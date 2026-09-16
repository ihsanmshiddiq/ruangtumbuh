// GET /api/planner/week?start=YYYY-MM-DD → tampilan minggu (kejadian, aktivitas, energi)
// POST /api/planner/week { start } → pastikan minggu terisi dari preferensi
import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/server/api";
import { requireContext } from "@/server/context";
import { getWeek, ensureWeekPlanned, listActivities } from "@/server/planner";
import { isISODate, weekStartOf } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireContext();
    const start = req.nextUrl.searchParams.get("start") ?? "";
    const ws = isISODate(start) ? weekStartOf(start) : weekStartOf(new Date().toISOString().slice(0, 10));
    const activities = await listActivities(ctx);
    await ensureWeekPlanned(ctx, ws, activities);
    return getWeek(ctx, ws, activities);
  });
}

const postSchema = z.object({ start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export async function POST(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireContext();
    const body = postSchema.parse(await req.json());
    const ws = weekStartOf(body.start);
    const activities = await listActivities(ctx);
    await ensureWeekPlanned(ctx, ws, activities);
    return getWeek(ctx, ws, activities);
  });
}
