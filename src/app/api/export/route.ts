import { NextResponse } from "next/server";
import { getMembershipContext } from "@/lib/auth";
import { getSupabaseFor, iso, unwrap } from "@/server/db";

// Backup on-demand — wajib dinamis, jangan pernah di-cache.
export const dynamic = "force-dynamic";

/**
 * BACKUP LENGKAP (Fase 5): satu file JSON berisi seluruh data workspace yang
 * bisa diakses pemanggil — workspace, aktivitas, log, rencana, energi,
 * refleksi, komentar, chat, dan Buku Kas pribadi pemanggil. Tanpa credential apa pun.
 * File ini privat: dibuat on-demand, diunduh langsung oleh pengguna, tidak
 * pernah dikirim ke layanan pihak ketiga.
 */
export async function GET() {
  const ctx = await getMembershipContext();
  if (!ctx) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }
  const wsId = ctx.workspace.id;
  const sb = await getSupabaseFor(ctx);

  const [
    wsRes,
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
    sb.from("workspaces").select("name").eq("id", wsId).maybeSingle(),
    sb.from("allocation_items").select("label, percent").eq("workspace_id", wsId).order("position").order("created_at"),
    sb.from("activities").select("*").eq("workspace_id", wsId).order("created_at"),
    sb.from("activity_logs").select("*").eq("workspace_id", wsId).order("date"),
    sb.from("weekly_plan_entries").select("*").eq("workspace_id", wsId).order("date"),
    sb.from("energy_logs").select("*").eq("workspace_id", wsId).order("date"),
    sb.from("weekly_reflections").select("*").eq("workspace_id", wsId).order("week_start"),
    sb.from("comments").select("*").eq("workspace_id", wsId).order("created_at"),
    sb.from("messages").select("*").eq("workspace_id", wsId).order("created_at"),
    sb.from("transaction_categories").select("*").eq("workspace_id", wsId).order("name"),
    sb.from("transactions").select("*").eq("workspace_id", wsId).eq("created_by", ctx.user.id).order("date"),
    sb.from("financial_targets").select("*").eq("workspace_id", wsId).order("created_at"),
    // Notes: hanya yang BOLEH dibaca pengguna ini (miliknya + shared) —
    // note private partner tidak pernah keluar dari database lewat backup.
    sb.from("notes").select("*").eq("workspace_id", wsId).or(`author_id.eq.${ctx.user.id},visibility.eq.shared`).order("updated_at"),
  ]);

  const w = (r: { data: unknown; error: { message: string } | null }) => (unwrap(r) ?? []) as unknown as Record<string, never>[];
  const acts = w(activities);
  const logs = w(activityLogs);
  const plans = w(weeklyPlanEntries);
  const energies = w(energyLogs);
  const refls = w(reflections);
  const cmts = w(comments);
  const msgs = w(messages);
  const cats = w(categories);
  const txs = w(transactions);
  const targets = w(financialTargets);
  const noteRows = w(notes);
  const allocs = w(allocationItems);
  const wsName = (unwrap(wsRes) as { name: string } | null)?.name ?? ctx.workspace.name;

  // Nama tampilan saja yang diekspor — email anggota lain tidak ikut.
  const nameById = new Map(ctx.workspace.members.map((m) => [m.id, m.displayName]));
  const person = (userId: unknown) => nameById.get(String(userId)) ?? null;
  const catNameById = new Map(cats.map((c) => [c.id, c.name]));
  const actNameById = new Map(acts.map((a) => [a.id, a.name]));

  const payload = {
    app: "ruang-tumbuh",
    version: 3,
    exportedAt: new Date().toISOString(),
    exportedBy: ctx.user.displayName,
    workspace: {
      name: wsName,
      members: ctx.workspace.members.map((m) => ({
        displayName: m.displayName,
        role: m.role,
        joinedAt: null,
      })),
      allocationItems: allocs.map((a) => ({ label: a.label, percent: a.percent })),
      activities: acts.map((a) => ({
        name: a.name,
        description: a.description,
        weeklyTarget: a.weekly_target,
        estimatedDurationMinutes: a.estimated_duration_minutes,
        preferredStartTime: a.preferred_start_time,
        preferredEndTime: a.preferred_end_time,
        preferredDays: Array.isArray(a.preferred_days) ? a.preferred_days : [],
        active: a.active,
        createdBy: person(a.created_by),
        createdAt: a.created_at,
      })),
      activityLogs: logs.map((l) => ({
        activity: actNameById.get(l.activity_id) ?? null,
        person: person(l.user_id),
        date: l.date,
        status: l.status,
        plannedDurationMinutes: l.planned_duration_minutes,
        actualDurationMinutes: l.actual_duration_minutes,
        note: l.note,
        rescheduledFrom: l.rescheduled_from,
      })),
      weeklyPlanEntries: plans.map((p) => ({
        activity: actNameById.get(p.activity_id) ?? null,
        person: person(p.user_id),
        date: p.date,
        plannedStartTime: p.planned_start_time,
        plannedEndTime: p.planned_end_time,
        status: p.status,
      })),
      energyLogs: energies.map((e) => ({
        person: person(e.user_id),
        date: e.date,
        level: e.level,
      })),
      reflections: refls.map((r) => ({
        person: person(r.user_id),
        weekStart: r.week_start,
        worked: r.worked,
        blocked: r.blocked,
        nextAdjustment: r.next_adjustment,
        weeklySentence: r.weekly_sentence,
        gratitude: r.gratitude,
      })),
      comments: cmts.map((c) => ({
        person: person(c.user_id),
        entityType: c.entity_type,
        content: c.content,
        createdAt: c.created_at,
      })),
      messages: msgs.map((m) => ({
        sender: person(m.sender_id),
        content: m.content,
        createdAt: m.created_at,
      })),
      finance: {
        categories: cats.map((c) => ({
          name: c.name,
          type: c.type,
          bucket: c.bucket,
          monthlyTarget: c.monthly_target,
          active: c.active,
        })),
        transactions: txs.map((t) => ({
          date: t.date,
          type: t.type,
          category: catNameById.get(t.category_id) ?? null,
          amount: t.amount,
          note: t.note,
          createdBy: person(t.created_by),
        })),
        targets: targets.map((t) => ({
          name: t.name,
          targetAmount: t.target_amount,
          currentAmount: t.current_amount,
          active: t.active,
        })),
      },
      notes: noteRows.map((n) => ({
        title: n.title,
        content: n.content,
        visibility: n.visibility,
        author: person(n.author_id),
        createdAt: iso(n.created_at),
        updatedAt: iso(n.updated_at),
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
