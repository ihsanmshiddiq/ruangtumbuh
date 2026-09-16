// Kehadiran ringan untuk dua anggota. "Aktif" berarti aplikasi terlihat dan
// mengirim heartbeat dalam 90 detik terakhir—bukan klaim online yang palsu.
import { NextResponse } from "next/server";
import { getMembershipContext } from "@/lib/auth";
import { getSupabaseFor, unwrap } from "@/server/db";

export const dynamic = "force-dynamic";

type PresenceRow = { id: string; updated_at: string };

async function listPresence() {
  const ctx = await getMembershipContext();
  if (!ctx) return null;
  const sb = await getSupabaseFor(ctx);
  const ids = ctx.workspace.members.map((member) => member.id);
  const rows = (unwrap(
    await sb.from("profiles").select("id, updated_at").in("id", ids)
  ) ?? []) as PresenceRow[];
  const byId = new Map(rows.map((row) => [row.id, row.updated_at]));
  return {
    ctx,
    members: ctx.workspace.members.map((member) => ({
      id: member.id,
      name: member.displayName,
      lastActiveAt: byId.get(member.id) ?? null,
    })),
  };
}

export async function GET() {
  try {
    const payload = await listPresence();
    if (!payload) return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
    return NextResponse.json({ members: payload.members });
  } catch {
    // Presence tidak boleh membuat halaman inti terasa gagal bila database
    // sedang sibuk. Klien menampilkan status "tidak diketahui".
    return NextResponse.json({ members: [] });
  }
}

export async function POST() {
  try {
    const initial = await listPresence();
    if (!initial) return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
    const sb = await getSupabaseFor(initial.ctx);
    // updated_at sudah dijaga trigger schema; nilai ini membuat aktivitas
    // terakhir eksplisit dan juga aman pada database yang belum memasang trigger.
    await sb
      .from("profiles")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", initial.ctx.user.id);
    const payload = await listPresence();
    return NextResponse.json({ members: payload?.members ?? initial.members });
  } catch {
    return NextResponse.json({ members: [] });
  }
}
