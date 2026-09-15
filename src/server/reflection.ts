// Data layer server-only: refleksi mingguan + komentar + weekly review.
// Semua query lewat klien pengguna — RLS Supabase menegakkan batas workspace.
import type { SessionContext } from "@/lib/types";
import { weekDates, addDays } from "@/lib/dates";
import { rupiah } from "@/lib/format";
import { getWeek } from "@/server/planner";
import { getSupabaseFor, unwrap } from "@/server/db";

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

const REFLECT_SELECT =
  "id, user_id, week_start, worked, blocked, next_adjustment, weekly_sentence, gratitude, updated_at";

type ReflectRow = {
  id: string; user_id: string; week_start: string;
  worked: string; blocked: string; next_adjustment: string;
  weekly_sentence: string; gratitude: string; updated_at: string;
};

function reflectDTO(r: ReflectRow, name: string): ReflectionDTO {
  return {
    id: r.id, userId: r.user_id, userName: name, weekStart: r.week_start,
    worked: r.worked, blocked: r.blocked, nextAdjustment: r.next_adjustment,
    weeklySentence: r.weekly_sentence, gratitude: r.gratitude,
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export async function getReflection(ctx: Ctx, weekStart: string, userId: string): Promise<ReflectionDTO | null> {
  const sb = await getSupabaseFor(ctx);
  const row = unwrap(
    await sb
      .from("weekly_reflections")
      .select(REFLECT_SELECT)
      .eq("user_id", userId)
      .eq("week_start", weekStart)
      .maybeSingle()
  ) as unknown as ReflectRow | null;
  if (!row) return null;
  const name = ctx.workspace.members.find((m) => m.id === row.user_id)?.displayName ?? "Anggota";
  return reflectDTO(row, name);
}

/** Kedua refleksi (Ihsan & Tantri) untuk satu minggu — tampil berdampingan. */
export async function getWeekReflections(ctx: Ctx, weekStart: string): Promise<ReflectionDTO[]> {
  const sb = await getSupabaseFor(ctx);
  const rows = (unwrap(
    await sb
      .from("weekly_reflections")
      .select(REFLECT_SELECT)
      .eq("workspace_id", ctx.workspace.id)
      .eq("week_start", weekStart)
  ) ?? []) as unknown as ReflectRow[];
  const nameById = new Map(ctx.workspace.members.map((m) => [m.id, m.displayName]));
  const order = ctx.workspace.members.map((m) => m.id);
  return rows
    .map((r) => reflectDTO(r, nameById.get(r.user_id) ?? "Anggota"))
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
  const sb = await getSupabaseFor(ctx);
  // Upsert manual: update baris milik sendiri, insert bila belum ada.
  // (RLS update butuh user_id = auth.uid(); insert menegakkan hal yang sama.)
  const updated = (unwrap(
    await sb
      .from("weekly_reflections")
      .update(data)
      .eq("user_id", ctx.user.id)
      .eq("week_start", weekStart)
      .select(REFLECT_SELECT)
  ) ?? []) as unknown as ReflectRow[];

  if (updated.length > 0) return reflectDTO(updated[0], ctx.user.displayName);

  const inserted = unwrap(
    await sb
      .from("weekly_reflections")
      .insert({
        workspace_id: ctx.workspace.id,
        user_id: ctx.user.id,
        week_start: weekStart,
        ...data,
      })
      .select(REFLECT_SELECT)
      .single()
  ) as unknown as ReflectRow;
  return reflectDTO(inserted, ctx.user.displayName);
}

/* ── Komentar (pada refleksi) ────────────────────────────────────────── */

export async function listComments(ctx: Ctx, weekStart: string): Promise<CommentDTO[]> {
  const sb = await getSupabaseFor(ctx);
  const reflections = (unwrap(
    await sb
      .from("weekly_reflections")
      .select("id")
      .eq("workspace_id", ctx.workspace.id)
      .eq("week_start", weekStart)
  ) ?? []) as unknown as { id: string }[];
  if (reflections.length === 0) return [];
  const rows = (unwrap(
    await sb
      .from("comments")
      .select("id, user_id, content, created_at")
      .eq("workspace_id", ctx.workspace.id)
      .eq("entity_type", "weekly_reflection")
      .in("entity_id", reflections.map((r) => r.id))
      .order("created_at", { ascending: true })
  ) ?? []) as unknown as { id: string; user_id: string; content: string; created_at: string }[];
  const nameById = new Map(ctx.workspace.members.map((m) => [m.id, m.displayName]));
  return rows.map((c) => ({
    id: c.id, userId: c.user_id,
    userName: nameById.get(c.user_id) ?? "Anggota",
    content: c.content,
    createdAt: new Date(c.created_at).toISOString(),
  }));
}

export async function addComment(
  ctx: Ctx,
  weekStart: string,
  content: string
): Promise<CommentDTO> {
  const sb = await getSupabaseFor(ctx);
  const target = unwrap(
    await sb
      .from("weekly_reflections")
      .select("id")
      .eq("workspace_id", ctx.workspace.id)
      .eq("week_start", weekStart)
      .neq("user_id", ctx.user.id)
      .limit(1)
      .maybeSingle()
  ) as { id: string } | null;
  const row = unwrap(
    await sb
      .from("comments")
      .insert({
        workspace_id: ctx.workspace.id,
        user_id: ctx.user.id, // dari sesi — RLS menegakkan juga
        entity_type: "weekly_reflection",
        entity_id: target?.id ?? `week:${weekStart}`,
        content: content.slice(0, 1000),
      })
      .select("id, user_id, content, created_at")
      .single()
  ) as unknown as { id: string; user_id: string; content: string; created_at: string };
  return {
    id: row.id, userId: row.user_id, userName: ctx.user.displayName,
    content: row.content, createdAt: new Date(row.created_at).toISOString(),
  };
}

/* ── Weekly review — agregat berbasis data, tanpa vonis ──────────────── */

export type WeeklyReview = {
  weekStart: string;
  planned: number;
  done: number;
  rescheduled: number;
  skipped: number;
  unavailable: number;
  percent: number;
  perActivity: {
    activityId: string; name: string;
    planned: number; done: number;
    plannedMinutes: number; actualMinutes: number; actualRecorded: number;
  }[];
  energyByUser: { userName: string; days: { date: string; level: number }[] }[];
  /** Riwayat perpindahan nyata: dari tanggal asal → tanggal tujuan. */
  moves: { activityName: string; from: string; to: string }[];
  /** Daftar kejadian yang dilewati (tanpa penyebab yang dikarang). */
  skippedList: { activityName: string; date: string }[];
  /** Tidak bisa dilakukan — konteks hanya dari catatan pengguna. */
  unavailableList: { activityName: string; date: string; note: string | null }[];
  /** Hari dengan energi terendah (untuk catatan hati-hati, bukan klaim). */
  lowestEnergy: { date: string; level: number } | null;
  rescheduledOnLowestEnergy: number;
};

export async function getWeeklyReview(ctx: Ctx, weekStart: string): Promise<WeeklyReview> {
  const week = await getWeek(ctx, weekStart);
  const occ = week.occurrences;
  // Definisi jujur agar tidak dihitung dua kali: kejadian asal yang sudah
  // dipindah (status "rescheduled") BUKAN rencana terpisah — ia "menjadi"
  // kejadian tujuan. "Dipindah" dihitung terpisah sebagai jumlah perubahan.
  const finalOcc = occ.filter((o) => o.status !== "rescheduled");
  const planned = finalOcc.length;
  const done = finalOcc.filter((o) => o.status === "done").length;
  const rescheduled = occ.length - finalOcc.length;
  const skipped = finalOcc.filter((o) => o.status === "skipped").length;
  // Tidak bisa dilakukan (tidak digeser, bukan kegagalan — hanya fakta).
  const unavailable = finalOcc.filter((o) => o.status === "unavailable").length;

  const byActivity = new Map<string, WeeklyReview["perActivity"][number]>();
  for (const o of finalOcc) {
    let entry = byActivity.get(o.activityId);
    if (!entry) {
      entry = { activityId: o.activityId, name: o.activityName, planned: 0, done: 0, plannedMinutes: 0, actualMinutes: 0, actualRecorded: 0 };
      byActivity.set(o.activityId, entry);
    }
    entry.planned += 1;
    if (o.status === "done") {
      entry.done += 1;
      entry.plannedMinutes += o.plannedDurationMinutes ?? 0;
      // Durasi aktual HANYA dihitung bila memang dicatat — tidak menyalin rencana.
      if (o.actualDurationMinutes != null) {
        entry.actualMinutes += o.actualDurationMinutes;
        entry.actualRecorded += 1;
      }
    }
  }

  // Perpindahan nyata: kejadian baru membawa rescheduledFrom = tanggal asal;
  // pasangkan dengan kejadian asal (status rescheduled) pada tanggal itu.
  const moves: WeeklyReview["moves"] = [];
  for (const o of occ) {
    if (!o.rescheduledFrom) continue;
    const original = occ.find((x) => x.activityId === o.activityId && x.date === o.rescheduledFrom && x.status === "rescheduled");
    if (original) {
      moves.push({ activityName: o.activityName, from: original.date, to: o.date });
    }
  }
  moves.sort((a, b) => a.from.localeCompare(b.from));

  const skippedList = occ
    .filter((o) => o.status === "skipped")
    .map((o) => ({ activityName: o.activityName, date: o.date }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Yang tidak bisa dilakukan — ditampilkan dengan konteks aslinya (note),
  // bukan dikarang penyebabnya.
  const unavailableList = occ
    .filter((o) => o.status === "unavailable")
    .map((o) => ({ activityName: o.activityName, date: o.date, note: o.note || null }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const nameById = new Map(ctx.workspace.members.map((m) => [m.id, m.displayName]));
  const energyByUser = Object.entries(week.energyByUser).map(([userId, days]) => ({
    userName: nameById.get(userId) ?? "Anggota",
    days: days.sort((a, b) => a.date.localeCompare(b.date)),
  }));

  // Hari energi terendah dari semua catatan minggu itu (pilih paling awal bila seri).
  const allEnergy = energyByUser.flatMap((u) => u.days);
  let lowestEnergy: WeeklyReview["lowestEnergy"] = null;
  for (const d of allEnergy) {
    if (!lowestEnergy || d.level < lowestEnergy.level || (d.level === lowestEnergy.level && d.date < lowestEnergy.date)) {
      lowestEnergy = { date: d.date, level: d.level };
    }
  }
  const rescheduledOnLowestEnergy = lowestEnergy
    ? occ.filter((o) => o.status === "rescheduled" && o.date === lowestEnergy!.date).length
    : 0;

  return {
    weekStart: week.weekStart,
    planned, done, rescheduled, skipped, unavailable,
    percent: planned > 0 ? Math.round((done / planned) * 100) : 0,
    perActivity: [...byActivity.values()].sort((a, b) => b.done - a.done),
    energyByUser,
    moves,
    skippedList,
    unavailableList,
    lowestEnergy,
    rescheduledOnLowestEnergy,
  };
}

/* ── Keuangan dua minggu sekaligus — SATU query rentang 14 hari ─────── */

export type WeekFinance = {
  income: number;
  expense: number;
  diff: number;
  txCount: number;
};

export type FinanceTwoWeeks = { current: WeekFinance; previous: WeekFinance };

export async function getFinanceTwoWeeks(ctx: Ctx, weekStart: string): Promise<FinanceTwoWeeks> {
  const dates = weekDates(weekStart);
  const prevDates = weekDates(addDays(weekStart, -7));
  const from = prevDates[0];
  const to = dates[6];
  const sb = await getSupabaseFor(ctx);
  const rows = (unwrap(
    await sb
      .from("transactions")
      .select("date, type, amount")
      .eq("workspace_id", ctx.workspace.id)
      .gte("date", from)
      .lte("date", to)
  ) ?? []) as unknown as { date: string; type: string; amount: number }[];
  const curFrom = dates[0];
  const sum = (list: typeof rows): WeekFinance => {
    let income = 0, expense = 0;
    for (const r of list) {
      if (r.type === "income") income += r.amount;
      else expense += r.amount;
    }
    return { income, expense, diff: income - expense, txCount: list.length };
  };
  return {
    current: sum(rows.filter((r) => r.date >= curFrom)),
    previous: sum(rows.filter((r) => r.date < curFrom)),
  };
}

/**
 * Insight berbasis data nyata — setiap kalimat bisa ditelusuri ke angka.
 * Tanpa klaim sebab-akibat, tanpa motivasi generik, tanpa AI eksternal.
 */
export function buildInsights(review: WeeklyReview, weekStart: string, finance?: FinanceTwoWeeks): string[] {
  const insights: string[] = [];
  if (review.planned === 0) return insights;

  // 1) Breakdown aktivitas terlihat
  const top = review.perActivity.find((a) => a.done > 0);
  if (top) {
    insights.push(`${top.done} dari ${top.planned} sesi ${top.name} minggu ini selesai.`);
  }

  // 2) Perpindahan
  if (review.moves.length > 0) {
    insights.push(`${review.moves.length} kejadian dipindahkan minggu ini.`);
  }

  // 2b) Tidak bisa dilakukan — fakta saja
  if (review.unavailable > 0) {
    insights.push(`${review.unavailable} kejadian tidak bisa dilakukan pada waktunya minggu ini.`);
  }

  // 3) Energi — bahasa hati-hati, korelasi bukan sebab-akibat
  const allEnergy = review.energyByUser.flatMap((u) => u.days);
  if (allEnergy.length >= 3) {
    const avg = allEnergy.reduce((s, d) => s + d.level, 0) / allEnergy.length;
    if (avg < 1.7) insights.push("Rata-rata energi minggu ini cenderung rendah.");
    else if (avg > 2.4) insights.push("Rata-rata energi minggu ini cenderung tinggi.");
    if (review.lowestEnergy && review.rescheduledOnLowestEnergy > 0) {
      insights.push(
        `Pada hari dengan energi terendah, ${review.rescheduledOnLowestEnergy} kejadian juga dipindah — dua hal ini tercatat bersamaan.`
      );
    }
  }

  // 4) Keuangan — perbandingan netral minggu vs minggu lalu
  if (finance && finance.previous.txCount > 0 && finance.current.txCount > 0) {
    const delta = finance.current.expense - finance.previous.expense;
    if (delta !== 0) {
      insights.push(
        delta < 0
          ? `Pengeluaran minggu ini ${rupiah(Math.abs(delta))} lebih rendah dibanding minggu lalu.`
          : `Pengeluaran minggu ini ${rupiah(delta)} lebih tinggi dibanding minggu lalu.`
      );
    }
  }

  if (insights.length === 0) {
    insights.push("Tidak ada pola yang cukup jelas minggu ini.");
  }
  return insights.slice(0, 4);
}
