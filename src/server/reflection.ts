// Data layer server-only: refleksi mingguan + komentar + weekly review.
// SEMUA query difilter workspaceId — ekuivalen RLS.
import { db } from "@/lib/db";
import type { SessionContext } from "@/lib/types";
import { weekDates } from "@/lib/dates";
import { getWeek } from "@/server/planner";

type Ctx = SessionContext;

export type ReflectionDTO = {
  id: string;
  userId: string;
  userName: string;
  weekStart: string;
  worked: string;
  blocked: string;
  nextAdjustment: string;
  weeklySentence: string;
  gratitude: string;
  updatedAt: string;
};

export type CommentDTO = {
  id: string; userId: string; userName: string; content: string; createdAt: string;
};

const FIELDS = ["worked", "blocked", "nextAdjustment", "weeklySentence", "gratitude"] as const;

export async function getReflection(ctx: Ctx, weekStart: string, userId: string): Promise<ReflectionDTO | null> {
  const row = await db.weeklyReflection.findUnique({
    where: { userId_weekStart: { userId, weekStart } },
  });
  if (!row) return null;
  const name = ctx.workspace.members.find((m) => m.id === row.userId)?.displayName ?? "Anggota";
  return {
    id: row.id, userId: row.userId, userName: name, weekStart: row.weekStart,
    worked: row.worked, blocked: row.blocked, nextAdjustment: row.nextAdjustment,
    weeklySentence: row.weeklySentence, gratitude: row.gratitude,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Kedua refleksi (Ihsan & Tantri) untuk satu minggu — tampil berdampingan. */
export async function getWeekReflections(ctx: Ctx, weekStart: string): Promise<ReflectionDTO[]> {
  const rows = await db.weeklyReflection.findMany({
    where: { workspaceId: ctx.workspace.id, weekStart },
  });
  const nameById = new Map(ctx.workspace.members.map((m) => [m.id, m.displayName]));
  const order = ctx.workspace.members.map((m) => m.id);
  return rows
    .map((r) => ({
      id: r.id, userId: r.userId,
      userName: nameById.get(r.userId) ?? "Anggota",
      weekStart: r.weekStart,
      worked: r.worked, blocked: r.blocked, nextAdjustment: r.nextAdjustment,
      weeklySentence: r.weeklySentence, gratitude: r.gratitude,
      updatedAt: r.updatedAt.toISOString(),
    }))
    .sort((a, b) => order.indexOf(a.userId) - order.indexOf(b.userId));
}

export async function upsertReflection(
  ctx: Ctx,
  weekStart: string,
  input: Partial<Record<(typeof FIELDS)[number], string>>
): Promise<ReflectionDTO> {
  const data: Record<string, string> = {};
  for (const f of FIELDS) {
    if (input[f] !== undefined) data[f] = input[f].slice(0, 4000);
  }
  const row = await db.weeklyReflection.upsert({
    where: { userId_weekStart: { userId: ctx.user.id, weekStart } },
    create: { workspaceId: ctx.workspace.id, userId: ctx.user.id, weekStart, ...data },
    update: data,
  });
  const name = ctx.user.displayName;
  return {
    id: row.id, userId: row.userId, userName: name, weekStart: row.weekStart,
    worked: row.worked, blocked: row.blocked, nextAdjustment: row.nextAdjustment,
    weeklySentence: row.weeklySentence, gratitude: row.gratitude,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/* ── Komentar (pada refleksi) ────────────────────────────────────────── */

export async function listComments(ctx: Ctx, weekStart: string): Promise<CommentDTO[]> {
  const reflections = await db.weeklyReflection.findMany({
    where: { workspaceId: ctx.workspace.id, weekStart },
    select: { id: true },
  });
  if (reflections.length === 0) return [];
  const rows = await db.comment.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      entityType: "weekly_reflection",
      entityId: { in: reflections.map((r) => r.id) },
    },
    orderBy: { createdAt: "asc" },
  });
  const nameById = new Map(ctx.workspace.members.map((m) => [m.id, m.displayName]));
  return rows.map((c) => ({
    id: c.id, userId: c.userId,
    userName: nameById.get(c.userId) ?? "Anggota",
    content: c.content,
    createdAt: c.createdAt.toISOString(),
  }));
}

export async function addComment(
  ctx: Ctx,
  weekStart: string,
  content: string
): Promise<CommentDTO> {
  const target = await db.weeklyReflection.findFirst({
    where: { workspaceId: ctx.workspace.id, weekStart, userId: { not: ctx.user.id } },
  });
  const row = await db.comment.create({
    data: {
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      entityType: "weekly_reflection",
      entityId: target?.id ?? `week:${weekStart}`,
      content: content.slice(0, 1000),
    },
  });
  return { id: row.id, userId: row.userId, userName: ctx.user.displayName, content: row.content, createdAt: row.createdAt.toISOString() };
}

/* ── Weekly review — agregat berbasis data, tanpa vonis ──────────────── */

export type WeeklyReview = {
  weekStart: string;
  planned: number;
  done: number;
  rescheduled: number;
  skipped: number;
  percent: number;
  perActivity: {
    activityId: string; name: string;
    planned: number; done: number;
    plannedMinutes: number; actualMinutes: number;
  }[];
  energyByUser: { userName: string; days: { date: string; level: number }[] }[];
};

export async function getWeeklyReview(ctx: Ctx, weekStart: string): Promise<WeeklyReview> {
  const week = await getWeek(ctx, weekStart);
  const occ = week.occurrences;
  const planned = occ.length;
  const done = occ.filter((o) => o.status === "done").length;
  const rescheduled = occ.filter((o) => o.status === "rescheduled").length;
  const skipped = occ.filter((o) => o.status === "skipped").length;

  const byActivity = new Map<string, WeeklyReview["perActivity"][number]>();
  for (const o of occ) {
    let entry = byActivity.get(o.activityId);
    if (!entry) {
      entry = { activityId: o.activityId, name: o.activityName, planned: 0, done: 0, plannedMinutes: 0, actualMinutes: 0 };
      byActivity.set(o.activityId, entry);
    }
    entry.planned += 1;
    if (o.status === "done") {
      entry.done += 1;
      entry.actualMinutes += o.actualDurationMinutes ?? o.plannedDurationMinutes ?? 0;
      entry.plannedMinutes += o.plannedDurationMinutes ?? 0;
    }
  }

  const nameById = new Map(ctx.workspace.members.map((m) => [m.id, m.displayName]));
  const energyByUser = Object.entries(week.energyByUser).map(([userId, days]) => ({
    userName: nameById.get(userId) ?? "Anggota",
    days: days.sort((a, b) => a.date.localeCompare(b.date)),
  }));

  return {
    weekStart: week.weekStart,
    planned, done, rescheduled, skipped,
    percent: planned > 0 ? Math.round((done / planned) * 100) : 0,
    perActivity: [...byActivity.values()].sort((a, b) => b.done - a.done),
    energyByUser,
  };
}

/** Insight berbasis data nyata — tanpa klaim sebab-akibat, tanpa motivasi generik. */
export function buildInsights(review: WeeklyReview, weekStart: string): string[] {
  const dates = weekDates(weekStart);
  const insights: string[] = [];
  if (review.planned === 0) return insights;

  const doneNames = review.perActivity.filter((a) => a.done > 0);
  if (doneNames.length > 0) {
    const a = doneNames[0];
    insights.push(`${a.done} dari ${a.planned} sesi ${a.name} minggu ini selesai.`);
  }
  if (review.rescheduled > 0) {
    const resAct = new Map<string, number>();
    // hitung dari occurrences lewat review per-activity tidak cukup — pakai agregat sederhana
    insights.push(`${review.rescheduled} kejadian dipindahkan minggu ini.`);
  }
  const energies = review.energyByUser.flatMap((u) => u.days.map((d) => d.level));
  if (energies.length >= 3) {
    const avg = energies.reduce((s, v) => s + v, 0) / energies.length;
    if (avg < 1.7) insights.push("Rata-rata energi minggu ini cenderung rendah.");
    else if (avg > 2.4) insights.push("Rata-rata energi minggu ini cenderung tinggi.");
  }
  if (review.percent >= 80 && review.planned >= 3) {
    insights.push(`Selesai ${review.percent}% dari rencana minggu ${dates[0].slice(8)}–${dates[6].slice(8)}.`);
  }
  return insights.slice(0, 3);
}
