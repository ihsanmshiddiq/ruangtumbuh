// GET  /api/categories → daftar kategori
// POST /api/categories → tambah kategori
import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/server/api";
import { requireContext } from "@/server/context";
import { listCategories, createCategory } from "@/server/finance";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const ctx = await requireContext();
    return { categories: await listCategories(ctx) };
  });
}

const BUCKETS = ["needs", "wants", "charity", "savings", "target", "income"] as const;

const schema = z.object({
  name: z.string().trim().min(1, "Nama kategori wajib diisi.").max(40),
  type: z.enum(["income", "expense"]),
  // Kategori pemasukan tidak butuh bucket — server yang menyelaraskan ke "income".
  bucket: z.enum(BUCKETS).optional(),
  monthlyTarget: z.number().int().min(0).max(100_000_000).optional(),
});

export async function POST(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireContext();
    const body = schema.parse(await req.json());
    const bucket = body.type === "income" ? "income" : body.bucket;
    if (!bucket) return { error: "Bucket kategori wajib dipilih." };
    return { category: await createCategory(ctx, { ...body, bucket }) };
  });
}
