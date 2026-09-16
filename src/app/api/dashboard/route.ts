import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/server/api";
import { requireContext } from "@/server/context";
import { getDashboard } from "@/server/dashboard";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireContext();
    const { date } = querySchema.parse({ date: request.nextUrl.searchParams.get("date") ?? undefined });
    return getDashboard(ctx, date ?? new Date().toISOString().slice(0, 10));
  });
}
