// GET /api/allocation → rencana alokasi pemasukan
// PUT /api/allocation → ubah persentase (wajib total 100)
import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/server/api";
import { requireContext } from "@/server/context";
import { getAllocationPlan, updateAllocationPlan } from "@/server/finance";

export const dynamic = "force-dynamic";

const schema = z.object({
  needsPercent: z.number().int().min(0).max(100),
  wantsPercent: z.number().int().min(0).max(100),
  charityPercent: z.number().int().min(0).max(100),
  savingsPercent: z.number().int().min(0).max(100),
  targetPercent: z.number().int().min(0).max(100),
});

export async function GET() {
  return handle(async () => {
    const ctx = await requireContext();
    return { plan: await getAllocationPlan(ctx) };
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireContext();
    const body = schema.parse(await req.json());
    const result = await updateAllocationPlan(ctx, body);
    if (!result.ok) return { error: result.error };
    return { plan: await getAllocationPlan(ctx) };
  });
}
