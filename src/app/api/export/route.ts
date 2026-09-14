import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getMembershipContext } from "@/lib/auth";

/**
 * Ekspor data workspace yang bisa diakses pengguna ini (portabilitas data,
 * filosofi dari kedua aplikasi asli). Fase 1: profil + workspace + anggota.
 * Fase berikutnya menambah aktivitas, log, refleksi, transaksi, dll.
 */
export async function GET() {
  const ctx = await getMembershipContext();
  if (!ctx) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }

  const [workspace, allocationPlan] = await Promise.all([
    db.workspace.findUnique({
      where: { id: ctx.workspace.id },
      include: {
        members: {
          select: { role: true, createdAt: true, user: { select: { displayName: true } } },
          orderBy: { createdAt: "asc" as const },
        },
      },
    }),
    db.allocationPlan.findUnique({ where: { workspaceId: ctx.workspace.id } }),
  ]);

  const payload = {
    app: "ruang-tumbuh",
    version: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: ctx.user.displayName,
    profile: { displayName: ctx.user.displayName },
    workspace: workspace
      ? {
          name: workspace.name,
          members: workspace.members.map((m) => ({
            displayName: m.user.displayName,
            role: m.role,
            joinedAt: m.createdAt,
          })),
          allocationPlan: allocationPlan
            ? {
                needsPercent: allocationPlan.needsPercent,
                wantsPercent: allocationPlan.wantsPercent,
                charityPercent: allocationPlan.charityPercent,
                savingsPercent: allocationPlan.savingsPercent,
                targetPercent: allocationPlan.targetPercent,
              }
            : null,
          // Bagian data berikut diisi di fase selanjutnya:
          activities: [],
          activityLogs: [],
          reflections: [],
          transactions: [],
          categories: [],
        }
      : null,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="ruang-tumbuh-ekspor-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
