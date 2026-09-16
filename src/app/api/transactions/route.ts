// POST /api/transactions → tambah transaksi
// DELETE /api/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD → hapus rentang
import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/server/api";
import { requireContext } from "@/server/context";
import { createTransaction, deleteTransactionsInRange } from "@/server/finance";
import { isISODate } from "@/lib/dates";

export const dynamic = "force-dynamic";

const schema = z.object({
  date: z.string().refine(isISODate, "Tanggal tidak valid."),
  type: z.enum(["income", "expense"]),
  categoryId: z.string().min(1, "Pilih kategori dulu."),
  amount: z.number().int("Nominal harus angka bulat.").positive("Nominal harus lebih dari 0."),
  note: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireContext();
    const body = schema.parse(await req.json());
    const transaction = await createTransaction(ctx, body);
    return { transaction };
  });
}

const deleteQuerySchema = z.object({
  from: z.string().refine(isISODate, "Tanggal awal tidak valid."),
  to: z.string().refine(isISODate, "Tanggal akhir tidak valid."),
}).refine(({ from, to }) => from <= to, {
  message: "Tanggal awal harus sebelum atau sama dengan tanggal akhir.",
  path: ["to"],
});

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireContext();
    const { from, to } = deleteQuerySchema.parse({
      from: req.nextUrl.searchParams.get("from"),
      to: req.nextUrl.searchParams.get("to"),
    });
    const deleted = await deleteTransactionsInRange(ctx, from, to);
    return { deleted };
  });
}
