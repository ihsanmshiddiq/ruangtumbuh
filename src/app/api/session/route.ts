import { NextResponse } from "next/server";
import { getMembershipContext } from "@/lib/auth";

// Memverifikasi sesi + keanggotaan workspace (setara SELECT dengan RLS).
export async function GET() {
  const ctx = await getMembershipContext();
  if (!ctx) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }
  return NextResponse.json(ctx);
}
