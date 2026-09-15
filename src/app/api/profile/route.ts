// Profile update milik sendiri — setara policy RLS: UPDATE profiles WHERE id = auth.uid().
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMembershipContext } from "@/lib/auth";
import { getSupabaseFor, unwrap } from "@/server/db";

// Membaca sesi — wajib dinamis.
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  displayName: z.string().trim().min(1, "Nama tampilan wajib diisi.").max(40, "Maksimal 40 karakter."),
});

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

  const sb = await getSupabaseFor(ctx);
  const updated = unwrap(
    await sb
      .from("profiles")
      .update({ display_name: parsed.data.displayName })
      .eq("id", ctx.user.id)
      .select("id, display_name")
      .single()
  ) as { id: string; display_name: string };

  return NextResponse.json({ ok: true, profile: { id: updated.id, displayName: updated.display_name } });
}
