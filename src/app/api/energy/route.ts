// PUT /api/energy { date, level } — level energi harian (1 rendah..3 tinggi)
import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/server/api";
import { requireContext } from "@/server/context";
import { setEnergy } from "@/server/planner";
import { isISODate } from "@/lib/dates";

export const dynamic = "force-dynamic";

const schema = z.object({
  date: z.string().refine(isISODate, "Tanggal tidak valid."),
  level: z.number().int().min(1, "Level energi 1–3.").max(3, "Level energi 1–3."),
});

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireContext();
    const body = schema.parse(await req.json());
    await setEnergy(ctx, body.date, body.level);
    return { ok: true };
  });
}
