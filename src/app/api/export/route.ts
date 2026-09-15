import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getMembershipContext } from "@/lib/auth";

// Membaca cookie sesi — wajib dinamis, jangan pernah di-cache.
export const dynamic = "force-dynamic";

/**
 * BACKUP LENGKAP (Fase 5): satu file JSON berisi seluruh data workspace yang
 * bisa diakses pemanggil — profil, workspace, aktivitas, log, rencana, energi,
 * refleksi, komentar, chat, dan seluruh Buku Kas. Tanpa credential apa pun.
 * File ini privat: dibuat on-demand, diunduh langsung oleh pengguna, tidak
 * pernah dikirim ke layanan pihak ketiga.
 */
export async function GET() {
  const ctx = await getMembershipContext();
  if (!ctx) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }
  const wsId = ctx.workspace.id;

  const [
    workspace,
    allocationItems,
    activities,
    activityLogs,
    weeklyPlanEntries,
    energyLogs,
    reflections,
    comments,
    messages,
    categories,
    transactions,
    financialTargets,
    notes,
  ] = await Promise.all([
    db.workspace.findUnique({
      where: { id: wsId },
      include: {
        members: {
          select: { role: true, createdAt: true, user: { select: { displayName: true } } },
          orderBy: { createdAt: "asc" as const },
        },
      },
    }),
    db.allocationItem.findMany({
      where: { workspaceId: wsId },
      orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }],
    }),
    db.activity.findMany({ where: { workspaceId: wsId }, orderBy: { createdAt: "asc" } }),
    db.activityLog.findMany({ where: { workspaceId: wsId }, orderBy: [{ date: "asc" }] }),
    db.weeklyPlanEntry.findMany({ where: { workspaceId: wsId }, orderBy: [{ date: "asc" }] }),
    db.energyLog.findMany({ where: { workspaceId: wsId }, orderBy: [{ date: "asc" }] }),
    db.weeklyReflection.findMany({ where: { workspaceId: wsId }, orderBy: [{ weekStart: "asc" }] }),
    db.comment.findMany({ where: { workspaceId: wsId }, orderBy: { createdAt: "asc" } }),
    db.message.findMany({ where: { workspaceId: wsId }, orderBy: { createdAt: "asc" } }),
    db.transactionCategory.findMany({ where: { workspaceId: wsId }, orderBy: { name: "asc" } }),
    db.transaction.findMany({ where: { workspaceId: wsId }, orderBy: [{ date: "asc" }] }),
    db.financialTarget.findMany({ where: { workspaceId: wsId }, orderBy: { createdAt: "asc" } }),
    // Notes: hanya yang BOLEH dibaca pengguna ini (miliknya + shared) —
    // note private partner tidak pernah keluar dari database lewat backup.
    db.note.findMany({
      where: { workspaceId: wsId, OR: [{ authorId: ctx.user.id }, { visibility: "shared" }] },
      orderBy: { updatedAt: "asc" },
    }),
  ]);

  // Nama tampilan saja yang diekspor — email anggota lain tidak ikut.
  const nameById = new Map(ctx.workspace.members.map((m) => [m.id, m.displayName]));
  const person = (userId: string) => nameById.get(userId) ?? null;
  const catNameById = new Map(categories.map((c) => [c.id, c.name]));

  const payload = {
    app: "ruang-tumbuh",
    version: 3,
    exportedAt: new Date().toISOString(),
    exportedBy: ctx.user.displayName,
    workspace: {
      name: workspace?.name ?? ctx.workspace.name,
      members: (workspace?.members ?? []).map((m) => ({
        displayName: m.user.displayName,
        role: m.role,
        joinedAt: m.createdAt,
      })),
      allocationItems: allocationItems.map((a) => ({
        label: a.label,
        percent: a.percent,
      })),
      activities: activities.map((a) => ({
        name: a.name,
        description: a.description,
        weeklyTarget: a.weeklyTarget,
        estimatedDurationMinutes: a.estimatedDurationMinutes,
        preferredStartTime: a.preferredStartTime,
        preferredEndTime: a.preferredEndTime,
        preferredDays: JSON.parse(a.preferredDays || "[]"),
        active: a.active,
        createdBy: person(a.createdBy),
        createdAt: a.createdAt,
      })),
      activityLogs: activityLogs.map((l) => ({
        activity: activities.find((a) => a.id === l.activityId)?.name ?? null,
        person: person(l.userId),
        date: l.date,
        status: l.status,
        plannedDurationMinutes: l.plannedDurationMinutes,
        actualDurationMinutes: l.actualDurationMinutes,
        note: l.note,
        rescheduledFrom: l.rescheduledFrom,
      })),
      weeklyPlanEntries: weeklyPlanEntries.map((p) => ({
        activity: activities.find((a) => a.id === p.activityId)?.name ?? null,
        person: person(p.userId),
        date: p.date,
        plannedStartTime: p.plannedStartTime,
        plannedEndTime: p.plannedEndTime,
        status: p.status,
      })),
      energyLogs: energyLogs.map((e) => ({
        person: person(e.userId),
        date: e.date,
        level: e.level,
      })),
      reflections: reflections.map((r) => ({
        person: person(r.userId),
        weekStart: r.weekStart,
        worked: r.worked,
        blocked: r.blocked,
        nextAdjustment: r.nextAdjustment,
        weeklySentence: r.weeklySentence,
        gratitude: r.gratitude,
      })),
      comments: comments.map((c) => ({
        person: person(c.userId),
        entityType: c.entityType,
        content: c.content,
        createdAt: c.createdAt,
      })),
      messages: messages.map((m) => ({
        sender: person(m.senderId),
        content: m.content,
        createdAt: m.createdAt,
      })),
      finance: {
        categories: categories.map((c) => ({
          name: c.name,
          type: c.type,
          bucket: c.bucket,
          monthlyTarget: c.monthlyTarget,
          active: c.active,
        })),
        transactions: transactions.map((t) => ({
          date: t.date,
          type: t.type,
          category: catNameById.get(t.categoryId) ?? null,
          amount: t.amount,
          note: t.note,
          createdBy: person(t.createdBy),
        })),
        targets: financialTargets.map((t) => ({
          name: t.name,
          targetAmount: t.targetAmount,
          currentAmount: t.currentAmount,
          active: t.active,
        })),
      },
      notes: notes.map((n) => ({
        title: n.title,
        content: n.content,
        visibility: n.visibility,
        author: person(n.authorId),
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      })),
    },
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="ruang-tumbuh-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
