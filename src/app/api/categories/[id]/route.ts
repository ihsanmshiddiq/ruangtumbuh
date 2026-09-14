// DELETE /api/categories/:id → hapus / nonaktifkan kategori
import { NextRequest } from "next/server";
import { handle } from "@/server/api";
import { requireContext } from "@/server/context";
import { deactivateCategory } from "@/server/finance";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireContext();
    const { id } = await params;
    const result = await deactivateCategory(ctx, id);
    return result;
  });
}
