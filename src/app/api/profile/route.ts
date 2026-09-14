import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getMembershipContext } from "@/lib/auth";

const patchSchema = z.object({
  displayName: z.string().trim().min(1, "Nama tampilan wajib diisi.").max(40, "Maksimal 40 karakter."),
});

// Update profil sendiri — setara policy RLS: UPDATE profiles WHERE id = auth.uid().
export async function PATCH(request: NextRequest) {
  const ctx = await getMembershipContext();
  if (!ctx) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Data tidak valid." },
      { status: 400 }
    );
  }

  const updated = await db.profile.update({
    where: { id: ctx.user.id },
    data: { displayName: parsed.data.displayName },
    select: { id: true, displayName: true },
  });

  return NextResponse.json({ ok: true, profile: updated });
}
