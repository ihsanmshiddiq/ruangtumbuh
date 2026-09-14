import { NextResponse } from "next/server";
import { getMembershipContext } from "@/lib/auth";

// Membaca cookie sesi — wajib dirender dinamis, jangan pernah di-cache.
export const dynamic = "force-dynamic";

// Memverifikasi sesi + keanggotaan workspace (setara SELECT dengan RLS).
export async function GET() {
  const ctx = await getMembershipContext();
  if (!ctx) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }
  return NextResponse.json(ctx);
}
