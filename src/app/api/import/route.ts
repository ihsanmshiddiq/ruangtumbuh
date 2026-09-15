import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getMembershipContext } from "@/lib/auth";

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
  const wsId = ctx.workspace.id;

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

    // Kategori: map nama → id (pakai yang ada, buat yang belum ada).
    const existingCats = await db.transactionCategory.findMany({ where: { workspaceId: wsId } });
    const catByName = new Map(existingCats.map((c) => [c.name.toLowerCase(), c.id]));
    for (const c of backup.workspace.finance.categories) {
      const key = c.name.toLowerCase();
      if (!catByName.has(key)) {
        const created = await db.transactionCategory.create({
          data: {
            workspaceId: wsId,
            name: c.name,
            type: c.type,
            bucket: c.bucket,
            monthlyTarget: c.monthlyTarget,
            active: c.active,
          },
        });
        catByName.set(key, created.id);
      }
    }

    // Aktivitas: map nama → id (pakai yang ada, buat yang belum ada).
    const existingActs = await db.activity.findMany({ where: { workspaceId: wsId } });
    const actByName = new Map(existingActs.map((a) => [a.name.toLowerCase(), a.id]));
    for (const a of backup.workspace.activities) {
      const key = a.name.toLowerCase();
      if (!actByName.has(key)) {
        const created = await db.activity.create({
          data: {
            workspaceId: wsId,
            createdBy: me,
            name: a.name,
            description: a.description,
            weeklyTarget: a.weeklyTarget,
            estimatedDurationMinutes: a.estimatedDurationMinutes,
            preferredStartTime: a.preferredStartTime,
            preferredEndTime: a.preferredEndTime,
            preferredDays: JSON.stringify(a.preferredDays),
            active: a.active,
          },
        });
        actByName.set(key, created.id);
      }
    }

    // Log aktivitas: upsert per (aktivitas, orang, tanggal) — duplikat aman.
    // Catatan: pemulihan bersifat "milik pemilik" untuk baris log (upsert butuh
    // satu pemilik baris); di aplikasi dua-orang ini wajar untuk restore.
    let skippedLogs = 0;
    for (const l of backup.workspace.activityLogs) {
      const activityId = actByName.get(l.activity.toLowerCase());
      if (!activityId) {
        skippedLogs++;
        continue;
      }
      try {
        await db.activityLog.upsert({
          where: { activityId_userId_date: { activityId, userId: me, date: l.date } },
          create: {
            workspaceId: wsId,
            activityId,
            userId: me,
            date: l.date,
            status: l.status,
            plannedDurationMinutes: l.plannedDurationMinutes,
            actualDurationMinutes: l.actualDurationMinutes,
            note: l.note,
            rescheduledFrom: l.rescheduledFrom,
          },
          update: {},
        });
      } catch {
        skippedLogs++;
      }
    }

    // Energi: upsert per (orang, tanggal).
    for (const e of backup.workspace.energyLogs) {
      await db.energyLog.upsert({
        where: { userId_date: { userId: me, date: e.date } },
        create: { workspaceId: wsId, userId: me, date: e.date, level: e.level },
        update: {},
      });
    }

    // Refleksi: upsert per (orang, minggu) — hanya isi field yang masih kosong.
    for (const r of backup.workspace.reflections) {
      await db.weeklyReflection.upsert({
        where: { userId_weekStart: { userId: me, weekStart: r.weekStart } },
        create: {
          workspaceId: wsId,
          userId: me,
          weekStart: r.weekStart,
          worked: r.worked,
          blocked: r.blocked,
          nextAdjustment: r.nextAdjustment,
          weeklySentence: r.weeklySentence,
          gratitude: r.gratitude,
        },
        update: {},
      });
    }

    // Transaksi: duplikat persis (tanggal+jumlah+kategori) dilewati.
    let skippedTx = 0;
    for (const t of backup.workspace.finance.transactions) {
      const categoryId = catByName.get(t.category.toLowerCase());
      if (!categoryId) {
        skippedTx++;
        continue;
      }
      const dup = await db.transaction.findFirst({
        where: { workspaceId: wsId, date: t.date, amount: t.amount, categoryId, type: t.type },
      });
      if (dup) {
        skippedTx++;
        continue;
      }
      await db.transaction.create({
        data: {
          workspaceId: wsId,
          createdBy: me,
          date: t.date,
          type: t.type,
          categoryId,
          amount: t.amount,
          note: t.note,
        },
      });
    }

    // Dana target: duplikat nama dilewati (perbandingan tanpa kapital —
    // mode "insensitive" hanya ada di Postgres, sandbox memakai SQLite).
    let skippedTargets = 0;
    const existingTargets = await db.financialTarget.findMany({ where: { workspaceId: wsId } });
    const targetNamesLower = new Set(existingTargets.map((t) => t.name.toLowerCase()));
    for (const t of backup.workspace.finance.targets) {
      if (targetNamesLower.has(t.name.toLowerCase())) {
        skippedTargets++;
        continue;
      }
      await db.financialTarget.create({
        data: {
          workspaceId: wsId,
          name: t.name,
          targetAmount: t.targetAmount,
          currentAmount: t.currentAmount,
          active: t.active,
        },
      });
    }

    // Notes: restore jadi milik si pemilik sesi, visibilitas dipertahankan.
    // Catatan identik (judul + isi) miliknya yang sudah ada dilewati.
    let skippedNotes = 0;
    for (const n of backup.workspace.notes) {
      const dup = await db.note.findFirst({
        where: {
          workspaceId: wsId,
          authorId: me,
          title: n.title,
          content: n.content,
        },
      });
      if (dup) {
        skippedNotes++;
        continue;
      }
      await db.note.create({
        data: {
          workspaceId: wsId,
          authorId: me,
          title: n.title,
          content: n.content,
          visibility: n.visibility,
        },
      });
    }

    // Alokasi: restore HANYA jika workspace belum punya pos sama sekali —
    // restore tidak pernah menimpa rencana yang sudah ada.
    const existingAlloc = await db.allocationItem.count({ where: { workspaceId: wsId } });
    if (existingAlloc === 0) {
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
        await db.allocationItem.createMany({
          data: items.map((it, i) => ({
            workspaceId: wsId,
            label: it.label,
            percent: it.percent,
            position: i,
          })),
        });
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
