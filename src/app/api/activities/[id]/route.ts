// PATCH /api/activities/:id → ubah preferensi berulang / arsipkan
import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/server/api";
import { requireContext } from "@/server/context";
import { updateActivity } from "@/server/planner";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  weeklyTarget: z.number().int().min(1).max(7).optional(),
  estimatedDurationMinutes: z.number().int().min(5).max(600).nullable().optional(),
  preferredStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  preferredEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  preferredDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireContext();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const activity = await updateActivity(ctx, id, body);
    if (!activity) return { error: "Aktivitas tidak ditemukan." };
    return { activity };
  });
}
