// Ganti kata sandi milik sesi aktif. Tidak memakai service role dan tidak
// pernah menerima ID user dari klien, sehingga seorang anggota hanya dapat
// mengganti password akunnya sendiri.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMembershipContext } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  currentPassword: z.string().min(1, "Masukkan kata sandi saat ini.").max(200),
  newPassword: z.string().min(12, "Kata sandi baru minimal 12 karakter.").max(200),
}).refine(({ currentPassword, newPassword }) => currentPassword !== newPassword, {
  message: "Kata sandi baru harus berbeda dari yang sekarang.",
  path: ["newPassword"],
});

export async function POST(request: NextRequest) {
  const ctx = await getMembershipContext();
  if (!ctx) return NextResponse.json({ error: "Sesi tidak valid. Masuk lagi, ya." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid." }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
    current_password: parsed.data.currentPassword,
  });
  if (error) {
    return NextResponse.json(
      { error: "Kata sandi saat ini salah atau kata sandi baru ditolak oleh aturan keamanan." },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
