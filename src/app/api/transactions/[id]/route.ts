// PATCH /api/transactions/:id → sunting transaksi
// DELETE /api/transactions/:id → hapus transaksi
import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/server/api";
import { requireContext } from "@/server/context";
import { updateTransaction, deleteTransaction } from "@/server/finance";
import { isISODate } from "@/lib/dates";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  date: z.string().refine(isISODate, "Tanggal tidak valid.").optional(),
  type: z.enum(["income", "expense"]).optional(),
  categoryId: z.string().min(1).optional(),
  amount: z.number().int("Nominal harus angka bulat.").positive("Nominal harus lebih dari 0.").optional(),
  note: z.string().max(200).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireContext();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const transaction = await updateTransaction(ctx, id, body);
    if (!transaction) return { error: "Transaksi tidak ditemukan." };
    return { transaction };
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireContext();
    const { id } = await params;
    const ok = await deleteTransaction(ctx, id);
    if (!ok) return { error: "Transaksi tidak ditemukan." };
    return { ok: true };
  });
}
