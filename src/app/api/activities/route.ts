// GET /api/activities → daftar aktivitas (preferensi berulang)
// POST /api/activities → buat aktivitas baru
import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/server/api";
import { requireContext } from "@/server/context";
import { listActivities, createActivity } from "@/server/planner";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const ctx = await requireContext();
    return { activities: await listActivities(ctx) };
  });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Nama aktivitas wajib diisi.").max(80),
  description: z.string().max(500).optional(),
  weeklyTarget: z.number().int().min(1, "Target mingguan minimal 1.").max(7).optional(),
  estimatedDurationMinutes: z.number().int().min(5, "Minimal 5 menit.").max(600, "Maksimal 600 menit.").nullable().optional(),
  preferredStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam HH:MM.").nullable().optional(),
  preferredEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam HH:MM.").nullable().optional(),
  preferredDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
});

export async function POST(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireContext();
    const body = createSchema.parse(await req.json());
    return { activity: await createActivity(ctx, body) };
  });
}
