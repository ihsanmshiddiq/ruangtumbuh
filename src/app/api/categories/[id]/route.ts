// PATCH  /api/categories/:id → sunting kategori (nama/kelompok/target bulanan)
// DELETE /api/categories/:id → hapus / nonaktifkan kategori
import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/server/api";
import { requireContext } from "@/server/context";
import { deactivateCategory, updateCategory } from "@/server/finance";

export const dynamic = "force-dynamic";

const BUCKETS = ["needs", "wants", "charity", "savings", "target", "income"] as const;

const patchSchema = z.object({
  name: z.string().trim().min(1, "Nama kategori wajib diisi.").max(40).optional(),
  bucket: z.enum(BUCKETS).optional(),
  monthlyTarget: z.number().int().min(0).max(100_000_000).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireContext();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    return { category: await updateCategory(ctx, id, body) };
  });
}
