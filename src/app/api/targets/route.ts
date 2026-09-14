// GET  /api/targets → daftar dana target + progres
// POST /api/targets { name, targetAmount } → target baru
// PUT  /api/targets { id, contribute } → setor dana ke target
import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/server/api";
import { requireContext } from "@/server/context";
import { listTargets, createTarget, contributeTarget } from "@/server/finance";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const ctx = await requireContext();
    return { targets: await listTargets(ctx) };
  });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Nama target wajib diisi.").max(60),
  targetAmount: z.number().int("Nominal harus angka bulat.").positive("Nominal target harus lebih dari 0."),
});

export async function POST(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireContext();
    const body = createSchema.parse(await req.json());
    return { target: await createTarget(ctx, body) };
  });
}

const contributeSchema = z.object({
  id: z.string().min(1),
  contribute: z.number().int("Nominal harus angka bulat.").positive("Nominal setor harus lebih dari 0."),
});

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireContext();
    const body = contributeSchema.parse(await req.json());
    const result = await contributeTarget(ctx, body.id, body.contribute);
    if (!result.ok) return { error: result.error };
    return { targets: await listTargets(ctx) };
  });
}
