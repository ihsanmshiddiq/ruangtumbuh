// Data layer server-only: planner, aktivitas, log 4 status, energi.
// SEMUA query difilter workspaceId dari konteks sesi — ekuivalen RLS.
// Prinsip inti (Fase 3): recurring preference TIDAK pernah diubah oleh
// reschedule; yang berubah hanya kejadian (ActivityLog) minggu tersebut.
import { db } from "@/lib/db";
import type { SessionContext } from "@/lib/types";
import { weekDates, weekStartOf, DOW_TO_WEEK_INDEX } from "@/lib/dates";

type Ctx = SessionContext;

export type ActivityDTO = {
  id: string;
  name: string;
  description: string;
  weeklyTarget: number;
  estimatedDurationMinutes: number | null;
  preferredStartTime: string | null;
  preferredEndTime: string | null;
  preferredDays: number[]; // 0..6 urutan minggu (Senin=0); [] = fleksibel
  active: boolean;
  createdBy: string;
  createdByName: string;
};

export type OccurrenceDTO = {
  id: string;
  activityId: string;
  activityName: string;
  activityDescription: string;
  date: string;
  dow: number; // 0..6 urutan minggu
  status: "planned" | "done" | "skipped" | "rescheduled" | "unavailable";
  plannedStartTime: string | null;
  plannedDurationMinutes: number | null;
  actualDurationMinutes: number | null;
  note: string;
  rescheduledFrom: string | null;
  userId: string;
  userName: string;
};

export type EnergyDTO = { date: string; level: number }[];

function mapActivity(a: {
  id: string; name: string; description: string; weeklyTarget: number;
  estimatedDurationMinutes: number | null; preferredStartTime: string | null;
  preferredEndTime: string | null; preferredDays: string; active: boolean;
  createdBy: string; createdByName?: string;
}, memberNameById: Map<string, string>): ActivityDTO {
  let days: number[] = [];
  try { days = JSON.parse(a.preferredDays) as number[]; } catch { days = []; }
  return {
    id: a.id, name: a.name, description: a.description, weeklyTarget: a.weeklyTarget,
    estimatedDurationMinutes: a.estimatedDurationMinutes,
    preferredStartTime: a.preferredStartTime, preferredEndTime: a.preferredEndTime,
    preferredDays: days, active: a.active,
    createdBy: a.createdBy,
    createdByName: a.createdByName ?? memberNameById.get(a.createdBy) ?? "Anggota",
  };
}

/* ── Aktivitas (preferensi berulang) ─────────────────────────────────── */

export async function listActivities(ctx: Ctx): Promise<ActivityDTO[]> {
  const [rows, members] = await Promise.all([
    db.activity.findMany({
      where: { workspaceId: ctx.workspace.id, active: true },
      orderBy: [{ preferredStartTime: "asc" }, { name: "asc" }],
    }),
    db.workspaceMember.findMany({
      where: { workspaceId: ctx.workspace.id },
      include: { user: { select: { displayName: true } } },
    }),
  ]);
  const nameById = new Map(members.map((m) => [m.userId, m.user.displayName]));
  return rows.map((a) => mapActivity(a, nameById));
}

export type ActivityInput = {
  name: string;
  description?: string;
  weeklyTarget?: number;
  estimatedDurationMinutes?: number | null;
  preferredStartTime?: string | null;
  preferredEndTime?: string | null;
  preferredDays?: number[];
};

export async function createActivity(ctx: Ctx, input: ActivityInput): Promise<ActivityDTO> {
  const member = await db.workspaceMember.findUniqueOrThrow({
    where: { workspaceId_userId: { workspaceId: ctx.workspace.id, userId: ctx.user.id } },
  });
  const row = await db.activity.create({
    data: {
      workspaceId: ctx.workspace.id,
      createdBy: ctx.user.id,
      name: input.name,
      description: input.description ?? "",
      weeklyTarget: input.weeklyTarget ?? 1,
      estimatedDurationMinutes: input.estimatedDurationMinutes ?? null,
      preferredStartTime: input.preferredStartTime ?? null,
      preferredEndTime: input.preferredEndTime ?? null,
      preferredDays: JSON.stringify(normalizeDays(input.preferredDays)),
    },
  });
  return mapActivity(row, new Map([[ctx.user.id, ctx.user.displayName]]));
}

function normalizeDays(days: number[] | undefined): number[] {
  if (!days) return [];
  const valid = days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return [...new Set(valid)].sort((a, b) => a - b);
}

export async function updateActivity(
  ctx: Ctx,
  id: string,
  input: Partial<ActivityInput> & { active?: boolean }
): Promise<ActivityDTO | null> {
  const existing = await db.activity.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
  });
  if (!existing) return null;
  const row = await db.activity.update({
    where: { id: existing.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.weeklyTarget !== undefined ? { weeklyTarget: input.weeklyTarget } : {}),
      ...(input.estimatedDurationMinutes !== undefined
        ? { estimatedDurationMinutes: input.estimatedDurationMinutes }
        : {}),
      ...(input.preferredStartTime !== undefined ? { preferredStartTime: input.preferredStartTime } : {}),
      ...(input.preferredEndTime !== undefined ? { preferredEndTime: input.preferredEndTime } : {}),
      ...(input.preferredDays !== undefined ? { preferredDays: JSON.stringify(normalizeDays(input.preferredDays)) } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
  return mapActivity(row, new Map([[ctx.user.id, ctx.user.displayName]]));
}

/* ── Kejadian mingguan (ActivityLog = rencana + realisasi) ───────────── */

function memberNames(ctx: Ctx): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of ctx.workspace.members) map.set(m.id, m.displayName);
  return map;
}

export type WeekView = {
  weekStart: string;
  activities: ActivityDTO[];
  occurrences: OccurrenceDTO[];
  energy: EnergyDTO;
  energyByUser: Record<string, { date: string; level: number }[]>;
};

export async function getWeek(ctx: Ctx, weekStart: string): Promise<WeekView> {
  const ws = weekStartOf(weekStart);
  const dates = weekDates(ws);
  const [activities, logs, planEntries, energies] = await Promise.all([
    listActivities(ctx),
    db.activityLog.findMany({
      where: { workspaceId: ctx.workspace.id, date: { in: dates } },
      orderBy: [{ date: "asc" }],
      include: { activity: { select: { name: true, description: true, preferredStartTime: true } } },
    }),
    db.weeklyPlanEntry.findMany({
      where: { workspaceId: ctx.workspace.id, date: { in: dates } },
      select: { activityId: true, userId: true, date: true, plannedStartTime: true },
    }),
    db.energyLog.findMany({
      where: { workspaceId: ctx.workspace.id, date: { in: dates } },
      orderBy: [{ date: "asc" }],
    }),
  ]);

  const nameById = memberNames(ctx);
  // Jam rencana tinggal di WeeklyPlanEntry (mirror skema); fallback ke preferensi.
  const timeByKey = new Map(planEntries.map((p) => [`${p.activityId}|${p.userId}|${p.date}`, p.plannedStartTime]));
  const occurrences: OccurrenceDTO[] = logs.map((l) => ({
    id: l.id,
    activityId: l.activityId,
    activityName: l.activity.name,
    activityDescription: l.activity.description,
    date: l.date,
    dow: DOW_TO_WEEK_INDEX[parseLocalDow(l.date)],
    status: l.status as OccurrenceDTO["status"],
    plannedStartTime:
      timeByKey.get(`${l.activityId}|${l.userId}|${l.date}`) ?? l.activity.preferredStartTime,
    plannedDurationMinutes: l.plannedDurationMinutes,
    actualDurationMinutes: l.actualDurationMinutes,
    note: l.note,
    rescheduledFrom: l.rescheduledFrom,
    userId: l.userId,
    userName: nameById.get(l.userId) ?? "Anggota",
  }));

  const energyByUser: Record<string, { date: string; level: number }[]> = {};
  for (const e of energies) {
    (energyByUser[e.userId] ??= []).push({ date: e.date, level: e.level });
  }

  return {
    weekStart: ws,
    activities,
    occurrences,
    energy: energies.filter((e) => e.userId === ctx.user.id).map((e) => ({ date: e.date, level: e.level })),
    energyByUser,
  };
}

function parseLocalDow(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getDay();
}

/** Kembalikan preferensi aktivitas dalam bentuk yang enak dibaca. */
export async function getActivity(ctx: Ctx, id: string): Promise<ActivityDTO | null> {
  const rows = await listActivities(ctx);
  return rows.find((a) => a.id === id) ?? null;
}

export type EnsurePlanInput = {
  activityId: string;
  date: string; // tanggal tujuan
  plannedStartTime: string | null;
  plannedDurationMinutes: number | null;
  rescheduledFrom?: string | null;
  status?: "planned" | "done" | "skipped" | "rescheduled";
};

/**
 * Idempoten: satu kejadian per (activity, user, date) — dua tabel:
 * ActivityLog (status & realisasi) + WeeklyPlanEntry (jam rencana).
 * Dipakai untuk auto-generate minggu & reschedule.
 */
export async function ensureOccurrence(ctx: Ctx, input: EnsurePlanInput): Promise<string> {
  const activity = await db.activity.findFirst({
    where: { id: input.activityId, workspaceId: ctx.workspace.id },
  });
  if (!activity) throw new Error("Aktivitas tidak ditemukan");
  const key = {
    activityId: input.activityId,
    userId: ctx.user.id,
    date: input.date,
  } as const;
  const row = await db.activityLog.upsert({
    where: { activityId_userId_date: key },
    create: {
      workspaceId: ctx.workspace.id,
      ...key,
      status: input.status ?? "planned",
      plannedDurationMinutes: input.plannedDurationMinutes,
      rescheduledFrom: input.rescheduledFrom ?? null,
    },
    update: {
      ...(input.plannedDurationMinutes !== undefined ? { plannedDurationMinutes: input.plannedDurationMinutes } : {}),
      ...(input.rescheduledFrom !== undefined ? { rescheduledFrom: input.rescheduledFrom } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });
  // Jam rencana terpisah di WeeklyPlanEntry (skema mirror Supabase).
  await db.weeklyPlanEntry.upsert({
    where: { activityId_userId_date: key },
    create: {
      workspaceId: ctx.workspace.id,
      ...key,
      plannedStartTime: input.plannedStartTime,
      status: input.status ?? "planned",
    },
    update: {
      ...(input.plannedStartTime !== undefined ? { plannedStartTime: input.plannedStartTime } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });
  return row.id;
}

export async function deleteOccurrence(ctx: Ctx, id: string): Promise<boolean> {
  const existing = await db.activityLog.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
  });
  if (!existing) return false;
  await db.activityLog.delete({ where: { id: existing.id } });
  return true;
}

/** Set status kejadian (done/skipped/unavailable/kembali planned). Reschedule memakai rescheduleOccurrence. */
export async function setOccurrenceStatus(
  ctx: Ctx,
  id: string,
  status: "planned" | "done" | "skipped" | "unavailable",
  extra?: { actualDurationMinutes?: number | null; note?: string }
): Promise<boolean> {
  const existing = await db.activityLog.findFirst({
    where: { id, workspaceId: ctx.workspace.id, userId: ctx.user.id },
  });
  if (!existing) return false;
  const data: { status: string; actualDurationMinutes?: number; note?: string } = { status };
  // Durasi aktual hanya disimpan bila dicatat (0–1440 menit); null diabaikan.
  const dur = extra?.actualDurationMinutes;
  if (typeof dur === "number" && Number.isInteger(dur) && dur >= 0 && dur <= 1440) {
    data.actualDurationMinutes = dur;
  }
  // Catatan/konteks (mis. alasan "unavailable") — dibersihkan, dibatasi panjang.
  if (extra?.note !== undefined) {
    const note = extra.note.trim().slice(0, 300);
    data.note = note;
  }
  await db.activityLog.update({ where: { id: existing.id }, data });
  await db.weeklyPlanEntry.updateMany({
    where: {
      workspaceId: ctx.workspace.id,
      activityId: existing.activityId,
      userId: existing.userId,
      date: existing.date,
    },
    data: { status },
  });
  return true;
}

/**
 * Reschedule kejadian TERTENTU ke tanggal/jam baru.
 * Recurring preference (Activity) TIDAK disentuh — hanya kejadian minggu ini.
 * Kejadian asal ditandai rescheduled (riwayat dipertahankan lewat rescheduledFrom).
 */
export async function rescheduleOccurrence(
  ctx: Ctx,
  id: string,
  target: { date: string; plannedStartTime: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const existing = await db.activityLog.findFirst({
    where: { id, workspaceId: ctx.workspace.id, userId: ctx.user.id },
    include: { activity: true },
  });
  if (!existing) return { ok: false, error: "Kejadian tidak ditemukan." };
  if (existing.status === "done") return { ok: false, error: "Aktivitas yang sudah selesai tidak perlu dipindahkan." };
  // Tanggal tujuan sama = tidak ada perubahan — anggap berhasil (idempoten).
  if (target.date === existing.date) return { ok: true };

  await db.activityLog.update({
    where: { id: existing.id },
    data: { status: "rescheduled" },
  });

  await ensureOccurrence(ctx, {
    activityId: existing.activityId,
    date: target.date,
    plannedStartTime: target.plannedStartTime,
    plannedDurationMinutes: existing.plannedDurationMinutes,
    rescheduledFrom: existing.date,
  });

  return { ok: true };
}

/* ── Energi harian (1–3) ─────────────────────────────────────────────── */

export async function setEnergy(ctx: Ctx, date: string, level: number): Promise<void> {
  if (!Number.isInteger(level) || level < 1 || level > 3) throw new Error("Level energi 1–3.");
  await db.energyLog.upsert({
    where: { userId_date: { userId: ctx.user.id, date } },
    create: { workspaceId: ctx.workspace.id, userId: ctx.user.id, date, level },
    update: { level },
  });
}

/** Pastikan minggu berisi kejadian "planned" dari preferensi aktivitas. */
export async function ensureWeekPlanned(ctx: Ctx, weekStart: string): Promise<void> {
  const ws = weekStartOf(weekStart);
  const dates = weekDates(ws);
  const activities = await listActivities(ctx);
  const existing = await db.activityLog.findMany({
    where: { workspaceId: ctx.workspace.id, date: { in: dates }, userId: ctx.user.id },
    select: { activityId: true, date: true, rescheduledFrom: true },
  });
  // Semua baris existing menempati unique (activityId,userId,date) — termasuk
  // hasil reschedule — jadi semuanya masuk set agar createMany tidak menabrak.
  const existingSet = new Set(existing.map((e) => `${e.activityId}|${e.date}`));
  // Tanggal asal yang sengaja ditinggalkan (kejadian dipindah) tidak boleh
  // dihidupkan ulang otomatis oleh ensure — itu keputusan pengguna.
  const vacated = new Set(
    existing.filter((e) => e.rescheduledFrom).map((e) => `${e.activityId}|${e.rescheduledFrom}`),
  );

  const creates: {
    workspaceId: string; activityId: string; userId: string; date: string;
    status: string; plannedDurationMinutes: number | null;
  }[] = [];
  const planCreates: {
    workspaceId: string; activityId: string; userId: string; date: string;
    status: string; plannedStartTime: string | null;
  }[] = [];
  for (const a of activities) {
    for (const date of dates) {
      const key = `${a.id}|${date}`;
      if (existingSet.has(key) || vacated.has(key)) continue;
      const dow = DOW_TO_WEEK_INDEX[parseLocalDow(date)];
      if (a.preferredDays.length > 0 && !a.preferredDays.includes(dow)) continue;
      creates.push({
        workspaceId: ctx.workspace.id,
        activityId: a.id,
        userId: ctx.user.id,
        date,
        status: "planned",
        plannedDurationMinutes: a.estimatedDurationMinutes,
      });
      planCreates.push({
        workspaceId: ctx.workspace.id,
        activityId: a.id,
        userId: ctx.user.id,
        date,
        status: "planned",
        plannedStartTime: a.preferredStartTime,
      });
    }
  }
  if (creates.length > 0) {
    await db.activityLog.createMany({ data: creates });
    await db.weeklyPlanEntry.createMany({ data: planCreates });
  }
}
