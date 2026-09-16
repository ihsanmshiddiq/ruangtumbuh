// PATCH  /api/targets/:id → sunting dana target (nama/nominal)
// DELETE /api/targets/:id → hapus dana target
import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/server/api";
import { requireContext } from "@/server/context";
import { deleteTarget, updateTarget } from "@/server/finance";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(1, "Nama target wajib diisi.").max(60).optional(),
  targetAmount: z.number().int("Nominal harus angka bulat.").positive("Nominal target harus lebih dari 0.").optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireContext();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    return { target: await updateTarget(ctx, id, body) };
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireContext();
    const { id } = await params;
    const ok = await deleteTarget(ctx, id);
    if (!ok) throw new Error("Target tidak ditemukan.");
    return { ok: true };
  });
}
