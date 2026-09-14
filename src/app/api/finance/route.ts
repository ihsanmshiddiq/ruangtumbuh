// GET /api/finance?month=YYYY-MM → payload lengkap Buku Kas untuk sebulan
import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/server/api";
import { requireContext } from "@/server/context";
import {
  getMonthSummary, listMonthTransactions, listCategories,
  getAllocationForMonth, listTargets,
} from "@/server/finance";
import { monthKey } from "@/lib/dates";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Bulan tidak valid.").optional(),
});

export async function GET(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireContext();
    const parsed = querySchema.parse({
      month: req.nextUrl.searchParams.get("month") ?? undefined,
    });
    const month = parsed.month ?? monthKey(new Date());
    const [summary, transactions, categories, allocation, targets] = await Promise.all([
      getMonthSummary(ctx, month),
      listMonthTransactions(ctx, month),
      listCategories(ctx),
      getAllocationForMonth(ctx, month),
      listTargets(ctx),
    ]);
    return { month, summary, transactions, categories, allocation, targets };
  });
}
