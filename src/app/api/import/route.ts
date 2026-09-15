import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMembershipContext } from "@/lib/auth";
import { getSupabaseFor, unwrap } from "@/server/db";

// Impor backup — operasi sensitif, jangan pernah di-cache.
export const dynamic = "force-dynamic";

/**
 * IMPORT BACKUP (Fase 5) — dua langkah, aman terhadap file rusak:
 *   1) POST { mode: "preview", data } → validasi ketat + ringkasan
 *   2) POST { mode: "restore", data } → pemulihan menambah data, TIDAK PERNAH menghapus
 *
 * Prinsip keamanan:
 * - Hanya pemilik workspace (role "owner") yang boleh memulihkan.
 * - Validasi skema penuh SEBELUM satu baris pun ditulis (zod).
 * - Tidak ada delete; duplikat (kategori bernama sama, aktivitas bernama sama,
 *   refleksi (orang, minggu) sama) dilewati dengan aman.
 * - Identitas penulis = pemilik yang sedang login (session), bukan dari file.
 *   RLS menegakkan hal yang sama di database (insert user_id = auth.uid()).
 * - Nominal & persentase divalidasi ulang; data aneh ditolak, bukan dikarang.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus format YYYY-MM-DD.");

const percentItem = z.object({
  label: z.string().trim().min(1).max(40),
  percent: z.number().int().min(0).max(100),
});

const backupSchema = z.object({
  app: z.literal("ruang-tumbuh"),
  version: z.number().int().min(1).max(3),
  workspace: z.object({
    activities: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(80),
          description: z.string().max(2000).default(""),
          weeklyTarget: z.number().int().min(1).max(70).default(1),
          estimatedDurationMinutes: z.number().int().min(1).max(1440).nullable().default(null),
          preferredStartTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/).nullable().default(null),
          preferredEndTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/).nullable().default(null),
          preferredDays: z.array(z.number().int().min(0).max(6)).default([]),
          active: z.boolean().default(true),
        })
      )
      .max(200)
      .default([]),
    activityLogs: z
      .array(
        z.object({
          activity: z.string().min(1).max(80),
          date: isoDate,
          status: z.enum(["planned", "done", "skipped", "rescheduled", "unavailable"]),
          plannedDurationMinutes: z.number().int().min(0).max(1440).nullable().default(null),
          actualDurationMinutes: z.number().int().min(0).max(1440).nullable().default(null),
          note: z.string().max(300).default(""),
          rescheduledFrom: isoDate.nullable().default(null),
        })
      )
      .max(10000)
      .default([]),
    energyLogs: z
      .array(
        z.object({
          date: isoDate,
          level: z.number().int().min(1).max(3),
        })
      )
      .max(10000)
      .default([]),
    reflections: z
      .array(
        z.object({
          weekStart: isoDate.refine((d) => {
            const dt = new Date(`${d}T00:00:00`);
            return dt.getDay() === 1; // wajib Senin
          }, "weekStart harus hari Senin."),
          worked: z.string().max(4000).default(""),
          blocked: z.string().max(4000).default(""),
          nextAdjustment: z.string().max(4000).default(""),
          weeklySentence: z.string().max(4000).default(""),
          gratitude: z.string().max(4000).default(""),
        })
      )
      .max(1000)
      .default([]),
    finance: z
      .object({
        categories: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(40),
              type: z.enum(["income", "expense"]),
              bucket: z.enum(["income", "needs", "wants", "charity", "savings", "target"]),
              monthlyTarget: z.number().int().min(0).default(0),
              active: z.boolean().default(true),
            })
          )
          .max(100)
          .default([]),
        transactions: z
          .array(
            z.object({
              date: isoDate,
              type: z.enum(["income", "expense"]),
              category: z.string().trim().min(1).max(40),
              amount: z.number().int().min(1).max(1_000_000_000),
              note: z.string().max(300).default(""),
            })
          )
          .max(50000)
          .default([]),
        targets: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(80),
              targetAmount: z.number().int().min(1).max(1_000_000_000_000),
              currentAmount: z.number().int().min(0).default(0),
              active: z.boolean().default(true),
            })
          )
          .max(100)
          .default([]),
      })
      .default({ categories: [], transactions: [], targets: [] }),
    notes: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(120),
          content: z.string().max(20000).default(""),
          visibility: z.enum(["private", "shared"]).default("private"),
        })
      )
      .max(2000)
      .default([]),
    // Backup v1–2: rencana 5 pos tetap. Backup v3: daftar pos bebas.
    allocationPlan: z
      .object({
        needsPercent: z.number().int().min(0).max(100),
        wantsPercent: z.number().int().min(0).max(100),
        charityPercent: z.number().int().min(0).max(100),
        savingsPercent: z.number().int().min(0).max(100),
        targetPercent: z.number().int().min(0).max(100),
      })
      .nullable()
      .default(null),
    allocationItems: z.array(percentItem).max(12).default([]),
  }),
});

type Backup = z.infer<typeof backupSchema>;

export async function POST(req: NextRequest) {
  const ctx = await getMembershipContext();
  if (!ctx) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }
  if (ctx.workspace.role !== "owner") {
    return NextResponse.json(
      { error: "Pemulihan backup hanya dilakukan oleh pemilik workspace." },
      { status: 403 }
    );
  }

  let body: { mode?: string; data?: unknown };
  try {
    body = (await req.json()) as { mode?: string; data?: unknown };
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  // Validasi penuh SEKARANG, sebelum menyentuh database.
  const parsed = backupSchema.safeParse(body.data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path?.join(".") ?? "(akar)";
    return NextResponse.json(
      { error: `File backup tidak sesuai format (bagian: ${path}). Data tidak diubah.` },
      { status: 400 }
    );
  }
  const backup: Backup = parsed.data;

  if (body.mode === "preview") {
    const counts = {
      activities: backup.workspace.activities.length,
      activityLogs: backup.workspace.activityLogs.length,
      energyLogs: backup.workspace.energyLogs.length,
      reflections: backup.workspace.reflections.length,
      categories: backup.workspace.finance.categories.length,
      transactions: backup.workspace.finance.transactions.length,
      targets: backup.workspace.finance.targets.length,
      notes: backup.workspace.notes.length,
      allocationItems: backup.workspace.allocationItems.length > 0
        ? backup.workspace.allocationItems.length
        : backup.workspace.allocationPlan
          ? 5
          : 0,
    };
    const txTotal = backup.workspace.finance.transactions.reduce((s, t) => s + t.amount, 0);
    return NextResponse.json({
      ok: true,
      counts,
      summary:
        `${counts.activities} aktivitas, ${counts.activityLogs} log aktivitas, ` +
        `${counts.reflections} refleksi, ${counts.transactions} transaksi ` +
        `(${txTotal.toLocaleString("id-ID")} total), ${counts.targets} dana target.`,
      note: "Pemulihan hanya MENAMBAH data — tidak ada data yang dihapus atau ditimpa. Duplikat akan dilewati.",
    });
  }

  if (body.mode !== "restore") {
    return NextResponse.json({ error: "Mode tidak dikenal." }, { status: 400 });
  }

  // ── RESTORE — hanya insert; identitas penulis = sesi login ──
  try {
    const me = ctx.user.id;
    const wsId = ctx.workspace.id;
    const sb = await getSupabaseFor(ctx);

    // Kategori: map nama → id (pakai yang ada, buat yang belum ada).
    const catByName = new Map<string, string>();
    const existingCats = (unwrap(
      await sb.from("transaction_categories").select("id, name").eq("workspace_id", wsId)
    ) ?? []) as unknown as { id: string; name: string }[];
    for (const c of existingCats) catByName.set(c.name.toLowerCase(), c.id);
    for (const c of backup.workspace.finance.categories) {
      const key = c.name.toLowerCase();
      if (!catByName.has(key)) {
        const created = unwrap(
          await sb
            .from("transaction_categories")
            .insert({
              workspace_id: wsId,
              name: c.name,
              type: c.type,
              bucket: c.bucket,
              monthly_target: c.monthlyTarget,
              active: c.active,
            })
            .select("id")
            .single()
        ) as { id: string };
        catByName.set(key, created.id);
      }
    }

    // Aktivitas: map nama → id (pakai yang ada, buat yang belum ada).
    const actByName = new Map<string, string>();
    const existingActs = (unwrap(
      await sb.from("activities").select("id, name").eq("workspace_id", wsId)
    ) ?? []) as unknown as { id: string; name: string }[];
    for (const a of existingActs) actByName.set(a.name.toLowerCase(), a.id);
    for (const a of backup.workspace.activities) {
      const key = a.name.toLowerCase();
      if (!actByName.has(key)) {
        const created = unwrap(
          await sb
            .from("activities")
            .insert({
              workspace_id: wsId,
              created_by: me,
              name: a.name,
              description: a.description,
              weekly_target: a.weeklyTarget,
              estimated_duration_minutes: a.estimatedDurationMinutes,
              preferred_start_time: a.preferredStartTime,
              preferred_end_time: a.preferredEndTime,
              preferred_days: a.preferredDays,
              active: a.active,
            })
            .select("id")
            .single()
        ) as { id: string };
        actByName.set(key, created.id);
      }
    }

    // Log aktivitas: upsert per (aktivitas, orang, tanggal) — duplikat aman.
    // Pemulihan bersifat "milik pemilik" untuk baris log; RLS menegakkan
    // user_id = auth.uid() pada insert — sesuai karena kita memakai `me`.
    let skippedLogs = 0;
    for (const l of backup.workspace.activityLogs) {
      const activityId = actByName.get(l.activity.toLowerCase());
      if (!activityId) {
        skippedLogs++;
        continue;
      }
      const res = await sb.from("activity_logs").upsert(
        {
          workspace_id: wsId,
          activity_id: activityId,
          user_id: me,
          date: l.date,
          status: l.status,
          planned_duration_minutes: l.plannedDurationMinutes,
          actual_duration_minutes: l.actualDurationMinutes,
          note: l.note,
          rescheduled_from: l.rescheduledFrom,
        },
        { onConflict: "activity_id,user_id,date", ignoreDuplicates: true }
      );
      if (res.error) skippedLogs++;
    }

    // Energi: upsert per (orang, tanggal) — yang sudah ada tidak ditimpa.
    for (const e of backup.workspace.energyLogs) {
      await sb.from("energy_logs").upsert(
        { workspace_id: wsId, user_id: me, date: e.date, level: e.level },
        { onConflict: "user_id,date", ignoreDuplicates: true }
      );
    }

    // Refleksi: upsert per (orang, minggu) — hanya mengisi bila belum ada.
    for (const r of backup.workspace.reflections) {
      await sb.from("weekly_reflections").upsert(
        {
          workspace_id: wsId,
          user_id: me,
          week_start: r.weekStart,
          worked: r.worked,
          blocked: r.blocked,
          next_adjustment: r.nextAdjustment,
          weekly_sentence: r.weeklySentence,
          gratitude: r.gratitude,
        },
        { onConflict: "user_id,week_start", ignoreDuplicates: true }
      );
    }

    // Transaksi: duplikat persis (tanggal+jumlah+kategori+jenis) dilewati.
    let skippedTx = 0;
    const existingTx = (unwrap(
      await sb
        .from("transactions")
        .select("date, amount, category_id, type")
        .eq("workspace_id", wsId)
    ) ?? []) as unknown as { date: string; amount: number; category_id: string; type: string }[];
    const txSeen = new Set(existingTx.map((t) => `${t.date}|${t.amount}|${t.category_id}|${t.type}`));
    for (const t of backup.workspace.finance.transactions) {
      const categoryId = catByName.get(t.category.toLowerCase());
      if (!categoryId) {
        skippedTx++;
        continue;
      }
      const key = `${t.date}|${t.amount}|${categoryId}|${t.type}`;
      if (txSeen.has(key)) {
        skippedTx++;
        continue;
      }
      txSeen.add(key);
      const res = await sb.from("transactions").insert({
        workspace_id: wsId,
        created_by: me,
        date: t.date,
        type: t.type,
        category_id: categoryId,
        amount: t.amount,
        note: t.note,
      });
      if (res.error) skippedTx++;
    }

    // Dana target: duplikat nama dilewati (perbandingan tanpa kapital).
    let skippedTargets = 0;
    const existingTargets = (unwrap(
      await sb.from("financial_targets").select("name").eq("workspace_id", wsId)
    ) ?? []) as unknown as { name: string }[];
    const targetNamesLower = new Set(existingTargets.map((t) => t.name.toLowerCase()));
    for (const t of backup.workspace.finance.targets) {
      if (targetNamesLower.has(t.name.toLowerCase())) {
        skippedTargets++;
        continue;
      }
      const res = await sb.from("financial_targets").insert({
        workspace_id: wsId,
        name: t.name,
        target_amount: t.targetAmount,
        current_amount: t.currentAmount,
        active: t.active,
      });
      if (res.error) skippedTargets++;
    }

    // Notes: restore jadi milik si pemilik sesi, visibilitas dipertahankan.
    // Catatan identik (judul + isi) miliknya yang sudah ada dilewati.
    let skippedNotes = 0;
    const existingNotes = (unwrap(
      await sb
        .from("notes")
        .select("title, content")
        .eq("workspace_id", wsId)
        .eq("author_id", me)
    ) ?? []) as unknown as { title: string; content: string }[];
    const noteSeen = new Set(existingNotes.map((n) => `${n.title}|${n.content}`));
    for (const n of backup.workspace.notes) {
      const key = `${n.title}|${n.content}`;
      if (noteSeen.has(key)) {
        skippedNotes++;
        continue;
      }
      noteSeen.add(key);
      const res = await sb.from("notes").insert({
        workspace_id: wsId,
        author_id: me,
        title: n.title,
        content: n.content,
        visibility: n.visibility,
      });
      if (res.error) skippedNotes++;
    }

    // Alokasi: restore HANYA jika workspace belum punya pos sama sekali —
    // restore tidak pernah menimpa rencana yang sudah ada.
    const existingAlloc = (unwrap(
      await sb.from("allocation_items").select("id").eq("workspace_id", wsId).limit(1)
    ) ?? []) as unknown as { id: string }[];
    if (existingAlloc.length === 0) {
      const plan = backup.workspace.allocationPlan;
      const items =
        backup.workspace.allocationItems.length > 0
          ? backup.workspace.allocationItems
          : plan
            ? [
                { label: "Kebutuhan", percent: plan.needsPercent },
                { label: "Keinginan", percent: plan.wantsPercent },
                { label: "Sedekah", percent: plan.charityPercent },
                { label: "Tabungan", percent: plan.savingsPercent },
                { label: "Dana target", percent: plan.targetPercent },
              ]
            : [];
      const total = items.reduce((s, i) => s + i.percent, 0);
      if (items.length > 0 && total === 100) {
        await sb.from("allocation_items").insert(
          items.map((it, i) => ({
            workspace_id: wsId,
            label: it.label,
            percent: it.percent,
            position: i,
          }))
        );
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Pemulihan selesai — data ditambahkan, tidak ada yang dihapus.",
      skipped: { logs: skippedLogs, transactions: skippedTx, targets: skippedTargets, notes: skippedNotes },
    });
  } catch {
    return NextResponse.json(
      { error: "Pemulihan terhenti di tengah jalan. Data yang sudah masuk tetap aman — coba lagi atau periksa file backup." },
      { status: 500 }
    );
  }
}
