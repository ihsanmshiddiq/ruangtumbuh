// Helper route API: bungkus handler dengan pemetaan error yang konsisten —
// pengguna melihat pesan manusiawi, tidak pernah error teknis mentah.
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "@/server/context";

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    // Kesalahan bisnis yang dikembalikan data layer sebagai { error } → 400.
    // { ok: true, error: "..." } tetap 200 (peringatan, bukan kegagalan).
    if (
      data && typeof data === "object" && "error" in data &&
      typeof (data as { error?: unknown }).error === "string" &&
      (data as { ok?: unknown }).ok !== true
    ) {
      return jsonError(400, (data as { error: string }).error);
    }
    return NextResponse.json(data ?? { ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return jsonError(401, "Sesi tidak valid. Masuk lagi, ya.");
    }
    if (e instanceof ZodError) {
      const first = e.issues[0];
      return jsonError(400, first?.message ?? "Data tidak valid.");
    }
    const msg = e instanceof Error ? e.message : "";
    // Pesan bisnis dari data layer aman ditampilkan; sisanya generik.
    const known = [
      "Kategori", "Nominal", "Total alokasi", "Persentase", "Level energi",
      "Aktivitas", "Kejadian", "Pesan", "Target", "Jenis",
    ].some((k) => msg.startsWith(k));
    if (known) return jsonError(400, msg);
    console.error("[api]", e);
    return jsonError(500, "Ada gangguan di server. Coba lagi sebentar.");
  }
}
