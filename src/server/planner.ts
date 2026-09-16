// Data layer server-only: planner, aktivitas, log 5 status, energi.
// Semua query lewat klien pengguna — RLS Supabase menegakkan batas workspace.
// Prinsip inti (Fase 3): recurring preference TIDAK pernah diubah oleh
// reschedule; yang berubah hanya kejadian (activity_logs) minggu tersebut.
import type { SessionContext } from "@/lib/types";
import { weekDates, weekStartOf, DOW_TO_WEEK_INDEX } from "@/lib/dates";
import { getSupabaseFor, unwrap } from "@/server/db";

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

type ActivityRow = {
  id: string;
  created_by: string;
  name: string;
  description: string;
  weekly_target: number;
  estimated_duration_minutes: number | null;
  preferred_start_time: string | null;
  preferred_end_time: string | null;
  preferred_days: number[] | null; // jsonb → array langsung
  active: boolean;
};

function mapActivity(a: ActivityRow, nameById: Map<string, string>): ActivityDTO {
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    weeklyTarget: a.weekly_target,
    estimatedDurationMinutes: a.estimated_duration_minutes,
    preferredStartTime: a.preferred_start_time,
    preferredEndTime: a.preferred_end_time,
    preferredDays: Array.isArray(a.preferred_days) ? a.preferred_days : [],
    active: a.active,
    createdBy: a.created_by,
    createdByName: nameById.get(a.created_by) ?? "Anggota",
  };
}

/* ── Aktivitas (preferensi berulang) ─────────────────────────────────── */

export async function listActivities(ctx: Ctx): Promise<ActivityDTO[]> {
  const sb = await getSupabaseFor(ctx);
  const nameById = new Map(ctx.workspace.members.map((m) => [m.id, m.displayName]));
  const rows = unwrap(
    await sb
      .from("activities")
      .select(
        "id, created_by, name, description, weekly_target, estimated_duration_minutes, preferred_start_time, preferred_end_time, preferred_days, active"
      )
      .eq("workspace_id", ctx.workspace.id)
      .eq("active", true)
      .order("preferred_start_time", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true })
  ) as ActivityRow[];
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

function normalizeDays(days: number[] | undefined): number[] {
  if (!days) return [];
  const valid = days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return [...new Set(valid)].sort((a, b) => a - b);
}

function activityPayload(input: Partial<ActivityInput>) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.weeklyTarget !== undefined) data.weekly_target = input.weeklyTarget;
  if (input.estimatedDurationMinutes !== undefined) data.estimated_duration_minutes = input.estimatedDurationMinutes;
  if (input.preferredStartTime !== undefined) data.preferred_start_time = input.preferredStartTime;
  if (input.preferredEndTime !== undefined) data.preferred_end_time = input.preferredEndTime;
  if (input.preferredDays !== undefined) data.preferred_days = normalizeDays(input.preferredDays);
  return data;
}

const ACTIVITY_SELECT =
  "id, created_by, name, description, weekly_target, estimated_duration_minutes, preferred_start_time, preferred_end_time, preferred_days, active";

export async function createActivity(ctx: Ctx, input: ActivityInput): Promise<ActivityDTO> {
  const sb = await getSupabaseFor(ctx);
  const row = unwrap(
    await sb
      .from("activities")
      .insert({
        workspace_id: ctx.workspace.id,
        created_by: ctx.user.id, // dari sesi — RLS menegakkan juga
        name: input.name,
        description: input.description ?? "",
        weekly_target: input.weeklyTarget ?? 1,
        estimated_duration_minutes: input.estimatedDurationMinutes ?? null,
        preferred_start_time: input.preferredStartTime ?? null,
        preferred_end_time: input.preferredEndTime ?? null,
        preferred_days: normalizeDays(input.preferredDays),
      })
      .select(ACTIVITY_SELECT)
      .single()
  ) as ActivityRow;
  return mapActivity(row, new Map([[ctx.user.id, ctx.user.displayName]]));
}

export async function updateActivity(
  ctx: Ctx,
  id: string,
  input: Partial<ActivityInput> & { active?: boolean }
): Promise<ActivityDTO | null> {
  const sb = await getSupabaseFor(ctx);
  const data = activityPayload(input);
  if (input.active !== undefined) data.active = input.active;
  const rows = unwrap(
    await sb
      .from("activities")
      .update(data)
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .eq("created_by", ctx.user.id)
      .select(ACTIVITY_SELECT)
  ) as ActivityRow[];
  const row = rows[0];
  if (!row) return null;
  return mapActivity(row, new Map([[ctx.user.id, ctx.user.displayName]]));
}

/* ── Kejadian mingguan (activity_logs = rencana + realisasi) ─────────── */

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

type LogRow = {
  id: string;
  activity_id: string;
  user_id: string;
  date: string;
  status: string;
  planned_duration_minutes: number | null;
  actual_duration_minutes: number | null;
  note: string;
  rescheduled_from: string | null;
  activity: { name: string; description: string; preferred_start_time: string | null } | null;
};

type PlanRow = {
  activity_id: string;
  user_id: string;
  date: string;
  planned_start_time: string | null;
};

type EnergyRow = { user_id: string; date: string; level: number };

export async function getWeek(ctx: Ctx, weekStart: string, knownActivities?: ActivityDTO[]): Promise<WeekView> {
  const ws = weekStartOf(weekStart);
  const dates = weekDates(ws);
  const sb = await getSupabaseFor(ctx);

  const [activities, logsRes, planRes, energyRes] = await Promise.all([
    knownActivities ? Promise.resolve(knownActivities) : listActivities(ctx),
    sb
      .from("activity_logs")
      .select(
        "id, activity_id, user_id, date, status, planned_duration_minutes, actual_duration_minutes, note, rescheduled_from, activity:activities ( name, description, preferred_start_time )"
      )
      .eq("workspace_id", ctx.workspace.id)
      .in("date", dates)
      .order("date", { ascending: true }),
    sb
      .from("weekly_plan_entries")
      .select("activity_id, user_id, date, planned_start_time")
      .eq("workspace_id", ctx.workspace.id)
      .in("date", dates),
    sb
      .from("energy_logs")
      .select("user_id, date, level")
      .eq("workspace_id", ctx.workspace.id)
      .in("date", dates)
      .order("date", { ascending: true }),
  ]);

  const logs = unwrap(logsRes) as unknown as LogRow[];
  const planEntries = (unwrap(planRes) ?? []) as unknown as PlanRow[];
  const energies = (unwrap(energyRes) ?? []) as unknown as EnergyRow[];

  const nameById = memberNames(ctx);
  // Jam rencana tinggal di weekly_plan_entries (mirror skema); fallback ke preferensi.
  const timeByKey = new Map(
    planEntries.map((p) => [`${p.activity_id}|${p.user_id}|${p.date}`, p.planned_start_time] as const)
  );
  const occurrences: OccurrenceDTO[] = logs.map((l) => ({
    id: l.id,
    activityId: l.activity_id,
    activityName: l.activity?.name ?? "—",
    activityDescription: l.activity?.description ?? "",
    date: l.date,
    dow: DOW_TO_WEEK_INDEX[parseLocalDow(l.date)],
    status: l.status as OccurrenceDTO["status"],
    plannedStartTime:
      timeByKey.get(`${l.activity_id}|${l.user_id}|${l.date}`) ?? l.activity?.preferred_start_time ?? null,
    plannedDurationMinutes: l.planned_duration_minutes,
    actualDurationMinutes: l.actual_duration_minutes,
    note: l.note,
    rescheduledFrom: l.rescheduled_from,
    userId: l.user_id,
    userName: nameById.get(l.user_id) ?? "Anggota",
  }));

  const energyByUser: Record<string, { date: string; level: number }[]> = {};
  for (const e of energies) {
    (energyByUser[e.user_id] ??= []).push({ date: e.date, level: e.level });
  }

  return {
    weekStart: ws,
    activities,
    occurrences,
    energy: energies.filter((e) => e.user_id === ctx.user.id).map((e) => ({ date: e.date, level: e.level })),
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
 * activity_logs (status & realisasi) + weekly_plan_entries (jam rencana).
 * Dipakai untuk auto-generate minggu & reschedule.
 */
export async function ensureOccurrence(ctx: Ctx, input: EnsurePlanInput): Promise<string> {
  const sb = await getSupabaseFor(ctx);

  const { data: activity } = await sb
    .from("activities")
    .select("id, created_by")
    .eq("id", input.activityId)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!activity || (activity as { created_by: string }).created_by !== ctx.user.id) {
    throw new Error("Aktivitas bukan milikmu.");
  }

  // activity_logs: update baris yang ada, atau insert baru (semantik upsert).
  const updateLog: Record<string, unknown> = {};
  if (input.plannedDurationMinutes !== undefined) updateLog.planned_duration_minutes = input.plannedDurationMinutes;
  if (input.rescheduledFrom !== undefined) updateLog.rescheduled_from = input.rescheduledFrom;
  if (input.status !== undefined) updateLog.status = input.status;

  const updatedLogs = unwrap(
    await sb
      .from("activity_logs")
      .update(updateLog)
      .eq("activity_id", input.activityId)
      .eq("user_id", ctx.user.id)
      .eq("date", input.date)
      .select("id")
  ) as { id: string }[];

  let logId: string;
  if (updatedLogs.length > 0) {
    logId = updatedLogs[0].id;
  } else {
    logId = (unwrap(
      await sb
        .from("activity_logs")
        .insert({
          workspace_id: ctx.workspace.id,
          activity_id: input.activityId,
          user_id: ctx.user.id,
          date: input.date,
          status: input.status ?? "planned",
          planned_duration_minutes: input.plannedDurationMinutes,
          rescheduled_from: input.rescheduledFrom ?? null,
        })
        .select("id")
        .single()
    ) as { id: string }).id;
  }

  // weekly_plan_entries: pola sama (jam rencana terpisah, mirror skema Supabase).
  const updatePlan: Record<string, unknown> = {};
  if (input.plannedStartTime !== undefined) updatePlan.planned_start_time = input.plannedStartTime;
  if (input.status !== undefined) updatePlan.status = input.status;

  const updatedPlans = unwrap(
    await sb
      .from("weekly_plan_entries")
      .update(updatePlan)
      .eq("activity_id", input.activityId)
      .eq("user_id", ctx.user.id)
      .eq("date", input.date)
      .select("id")
  ) as { id: string }[];

  if (updatedPlans.length === 0) {
    await sb.from("weekly_plan_entries").upsert(
      {
        workspace_id: ctx.workspace.id,
        activity_id: input.activityId,
        user_id: ctx.user.id,
        date: input.date,
        planned_start_time: input.plannedStartTime,
        planned_end_time: null,
        status: input.status ?? "planned",
      },
      { onConflict: "activity_id,user_id,date" }
    );
  }

  return logId;
}

export async function deleteOccurrence(ctx: Ctx, id: string): Promise<boolean> {
  const sb = await getSupabaseFor(ctx);
  const rows = unwrap(
    await sb
      .from("activity_logs")
      .delete()
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .select("id")
  ) as { id: string }[];
  return rows.length > 0;
}

/** Set status kejadian (done/skipped/unavailable/kembali planned). Reschedule memakai rescheduleOccurrence. */
export async function setOccurrenceStatus(
  ctx: Ctx,
  id: string,
  status: "planned" | "done" | "skipped" | "unavailable",
  extra?: { actualDurationMinutes?: number | null; note?: string }
): Promise<boolean> {
  const sb = await getSupabaseFor(ctx);
  const existing = unwrap(
    await sb
      .from("activity_logs")
      .select("id, activity_id, user_id, date")
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .eq("user_id", ctx.user.id)
      .maybeSingle()
  ) as { id: string; activity_id: string; user_id: string; date: string } | null;
  if (!existing) return false;

  const data: Record<string, unknown> = { status };
  // Durasi aktual hanya disimpan bila dicatat (0–1440 menit); null diabaikan.
  const dur = extra?.actualDurationMinutes;
  if (typeof dur === "number" && Number.isInteger(dur) && dur >= 0 && dur <= 1440) {
    data.actual_duration_minutes = dur;
  }
  // Catatan/konteks (mis. alasan "unavailable") — dibersihkan, dibatasi panjang.
  if (extra?.note !== undefined) {
    data.note = extra.note.trim().slice(0, 300);
  }
  await sb.from("activity_logs").update(data).eq("id", existing.id);
  await sb
    .from("weekly_plan_entries")
    .update({ status })
    .eq("workspace_id", ctx.workspace.id)
    .eq("activity_id", existing.activity_id)
    .eq("user_id", existing.user_id)
    .eq("date", existing.date);
  return true;
}

/**
 * Reschedule kejadian TERTENTU ke tanggal/jam baru.
 * Recurring preference (activities) TIDAK disentuh — hanya kejadian minggu ini.
 * Kejadian asal ditandai rescheduled (riwayat dipertahankan lewat rescheduled_from).
 */
export async function rescheduleOccurrence(
  ctx: Ctx,
  id: string,
  target: { date: string; plannedStartTime: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const sb = await getSupabaseFor(ctx);
  const existing = unwrap(
    await sb
      .from("activity_logs")
      .select("id, activity_id, user_id, date, status, planned_duration_minutes")
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .eq("user_id", ctx.user.id)
      .maybeSingle()
  ) as { id: string; activity_id: string; user_id: string; date: string; status: string; planned_duration_minutes: number | null } | null;
  if (!existing) return { ok: false, error: "Kejadian tidak ditemukan." };
  if (existing.status === "done") return { ok: false, error: "Aktivitas yang sudah selesai tidak perlu dipindahkan." };
  // Tanggal tujuan sama = tidak ada perubahan — anggap berhasil (idempoten).
  if (target.date === existing.date) return { ok: true };

  await sb.from("activity_logs").update({ status: "rescheduled" }).eq("id", existing.id);

  await ensureOccurrence(ctx, {
    activityId: existing.activity_id,
    date: target.date,
    plannedStartTime: target.plannedStartTime,
    plannedDurationMinutes: existing.planned_duration_minutes,
    rescheduledFrom: existing.date,
  });

  return { ok: true };
}

/* ── Energi harian (1–3) ─────────────────────────────────────────────── */

export async function setEnergy(ctx: Ctx, date: string, level: number): Promise<void> {
  if (!Number.isInteger(level) || level < 1 || level > 3) throw new Error("Level energi 1–3.");
  const sb = await getSupabaseFor(ctx);
  await sb.from("energy_logs").upsert(
    {
      workspace_id: ctx.workspace.id,
      user_id: ctx.user.id,
      date,
      level,
    },
    { onConflict: "user_id,date" }
  );
}

/** Pastikan minggu berisi kejadian "planned" dari preferensi aktivitas. */
export async function ensureWeekPlanned(ctx: Ctx, weekStart: string, knownActivities?: ActivityDTO[]): Promise<void> {
  const ws = weekStartOf(weekStart);
  const dates = weekDates(ws);
  const activities = (knownActivities ?? await listActivities(ctx)).filter((activity) => activity.createdBy === ctx.user.id);
  const sb = await getSupabaseFor(ctx);
  const existing = (unwrap(
    await sb
      .from("activity_logs")
      .select("activity_id, date, rescheduled_from")
      .eq("workspace_id", ctx.workspace.id)
      .eq("user_id", ctx.user.id)
      .in("date", dates)
  ) ?? []) as unknown as { activity_id: string; date: string; rescheduled_from: string | null }[];

  // Semua baris existing menempati unique (activity_id,user_id,date) — termasuk
  // hasil reschedule — jadi semuanya masuk set agar insert tidak menabrak.
  const existingSet = new Set(existing.map((e) => `${e.activity_id}|${e.date}`));
  // Tanggal asal yang sengaja ditinggalkan (kejadian dipindah) tidak boleh
  // dihidupkan ulang otomatis oleh ensure — itu keputusan pengguna.
  const vacated = new Set(
    existing.filter((e) => e.rescheduled_from).map((e) => `${e.activity_id}|${e.rescheduled_from}`)
  );

  const creates: Record<string, unknown>[] = [];
  const planCreates: Record<string, unknown>[] = [];
  for (const a of activities) {
    for (const date of dates) {
      const key = `${a.id}|${date}`;
      if (existingSet.has(key) || vacated.has(key)) continue;
      const dow = DOW_TO_WEEK_INDEX[parseLocalDow(date)];
      if (a.preferredDays.length > 0 && !a.preferredDays.includes(dow)) continue;
      creates.push({
        workspace_id: ctx.workspace.id,
        activity_id: a.id,
        user_id: ctx.user.id,
        date,
        status: "planned",
        planned_duration_minutes: a.estimatedDurationMinutes,
      });
      planCreates.push({
        workspace_id: ctx.workspace.id,
        activity_id: a.id,
        user_id: ctx.user.id,
        date,
        status: "planned",
        planned_start_time: a.preferredStartTime,
      });
    }
  }
  if (creates.length > 0) {
    await sb.from("activity_logs").insert(creates);
    await sb.from("weekly_plan_entries").insert(planCreates);
  }
}
