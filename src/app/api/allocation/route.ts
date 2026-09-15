// GET /api/allocation → daftar pos alokasi pemasukan (auto-seed bawaan)
// PUT /api/allocation → simpan daftar pos (tambah/hapus/ganti nama/ubah %)
// Aturan: total persentase wajib tepat 100.
import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/server/api";
import { requireContext } from "@/server/context";
import { getAllocationItems, updateAllocationItems } from "@/server/finance";

export const dynamic = "force-dynamic";

const schema = z.object({
  items: z
    .array(
      z.object({
        label: z.string().min(1).max(40),
        percent: z.number().int().min(0).max(100),
      }),
    )
    .min(1)
    .max(12),
});

export async function GET() {
  return handle(async () => {
    const ctx = await requireContext();
    return { items: await getAllocationItems(ctx) };
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireContext();
    const body = schema.parse(await req.json());
    const result = await updateAllocationItems(ctx, body.items);
    if (!result.ok) return { error: result.error };
    return { items: await getAllocationItems(ctx) };
  });
}
