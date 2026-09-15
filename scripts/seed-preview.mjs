// Isi data contoh untuk preview Review Mingguan — sekali pakai.
// Semua bertanda "(contoh)" agar mudah dibersihkan (scripts/cleanup-preview.mjs).
// Jalankan: bun scripts/seed-preview.mjs
import { PrismaClient } from "@prisma/client";
import { addDays, weekDates, weekStartOf, toISODate } from "../src/lib/dates.ts";

const db = new PrismaClient();
const today = new Date();
const todayIso = toISODate(today);
const ws = weekStartOf(todayIso);
const wsLast = addDays(ws, -7);
const dates = weekDates(ws);
const lastDates = weekDates(wsLast);

const ctxWorkspace = (await db.workspace.findFirstOrThrow()).id;
const members = await db.workspaceMember.findMany({
  where: { workspaceId: ctxWorkspace },
  include: { user: { select: { id: true, displayName: true } } },
});
const owner = members.find((m) => m.role === "owner")?.user ?? members[0].user;
const partner = members.find((m) => m.role === "partner")?.user ?? members[members.length - 1].user;
console.log(`workspace: ${ctxWorkspace.slice(0, 8)}… · owner: ${owner.displayName} · partner: ${partner.displayName}`);

// Aktivitas contoh (hanya bila belum ada)
async function upsertActivity(name, days, time, minutes) {
  let a = await db.activity.findFirst({ where: { workspaceId: ctxWorkspace, name } });
  if (a) return a;
  a = await db.activity.create({
    data: {
      workspaceId: ctxWorkspace, createdBy: owner.id, name,
      weeklyTarget: days.length, estimatedDurationMinutes: minutes,
      preferredStartTime: time, preferredDays: JSON.stringify(days),
    },
  });
  return a;
}

const coding = await upsertActivity("Coding (contoh)", [0, 2, 4], "19:15", 60);
const olahraga = await upsertActivity("Olahraga (contoh)", [1, 3, 5], "17:00", 40);
const ngaji = await upsertActivity("Ngaji (contoh)", [0, 1, 2, 3, 4, 5, 6], "05:00", 30);

function dowOf(dateIso) {
  const [y, m, d] = dateIso.split("-").map(Number);
  return [6, 0, 1, 2, 3, 4, 5][new Date(y, m - 1, d).getDay()];
}

// Kejadian dua minggu dengan ragam status
for (const [weekStart, list] of [
  [ws, dates], [wsLast, lastDates],
]) {
  const isThisWeek = weekStart === ws;
  for (const date of list) {
    const dow = dowOf(date);
    const plan = [];
    if (coding.preferredDays.includes(dow)) plan.push([coding, "19:15", 60]);
    if (olahraga.preferredDays.includes(dow)) plan.push([olahraga, "17:00", 40]);
    if (ngaji.preferredDays.includes(dow)) plan.push([ngaji, "05:00", 30]);

    for (const [act, time, mins] of plan) {
      const exists = await db.activityLog.findUnique({
        where: { activityId_userId_date: { activityId: act.id, userId: owner.id, date } },
      });
      if (exists) continue;

      // Pola status supaya review kelihatan variatif
      let status = "done";
      let actual = mins;
      if (isThisWeek) {
        if (date === dates[6]) { status = "planned"; actual = null; } // akhir pekan: belum
        if (date === dates[5] && act === coding) { status = "skipped"; actual = null; }
      } else {
        if (dow === 6) { status = "planned"; actual = null; }
      }
      // Ngaji selalu tuntas; Coding kadang lebih lama, Olahraga lebih cepat
      if (status === "done") {
        if (act === coding) actual = mins + 20;
        if (act === olahraga) actual = mins - 10;
      }

      await db.activityLog.create({
        data: {
          workspaceId: ctxWorkspace, activityId: act.id, userId: owner.id,
          date, status, plannedDurationMinutes: status === "planned" ? mins : mins,
          actualDurationMinutes: actual,
        },
      });
      await db.weeklyPlanEntry.create({
        data: {
          workspaceId: ctxWorkspace, activityId: act.id, userId: owner.id,
          date, status, plannedStartTime: time,
        },
      });
    }
  }
}

// Satu perpindahan: Coding Senin minggu ini → Rabu
const src = await db.activityLog.findUnique({
  where: { activityId_userId_date: { activityId: coding.id, userId: owner.id, date: dates[0] } },
});
if (src && src.status !== "rescheduled") {
  const dst = await db.activityLog.findUnique({
    where: { activityId_userId_date: { activityId: coding.id, userId: owner.id, date: dates[2] } },
  });
  if (dst) {
    await db.activityLog.update({ where: { id: src.id }, data: { status: "rescheduled" } });
    await db.activityLog.update({ where: { id: dst.id }, data: { rescheduledFrom: dates[0] } });
    await db.weeklyPlanEntry.update({ where: { id: (await db.weeklyPlanEntry.findUnique({ where: { activityId_userId_date: { activityId: coding.id, userId: owner.id, date: dates[2] } } })).id }, data: { plannedStartTime: "20:00" } });
    console.log("perpindahan: Coding Senin → Rabu (20:00)");
  }
}

// Energi minggu ini (owner) — rendah di tengah pekan
const energyLevels = [3, 2, 1, 2, 3, 3, null];
for (let i = 0; i < 7; i++) {
  const level = energyLevels[i];
  if (!level) continue;
  await db.energyLog.upsert({
    where: { userId_date: { userId: owner.id, date: dates[i] } },
    create: { workspaceId: ctxWorkspace, userId: owner.id, date: dates[i], level },
    update: { level },
  });
}
// Energi partner: 2 hari saja
await db.energyLog.upsert({
  where: { userId_date: { userId: partner.id, date: dates[1] } },
  create: { workspaceId: ctxWorkspace, userId: partner.id, date: dates[1], level: 3 },
  update: { level: 3 },
});
await db.energyLog.upsert({
  where: { userId_date: { userId: partner.id, date: dates[4] } },
  create: { workspaceId: ctxWorkspace, userId: partner.id, date: dates[4], level: 2 },
  update: { level: 2 },
});

// Kategori & transaksi contoh (dua minggu)
async function upsertCategory(name, type, bucket) {
  let c = await db.transactionCategory.findFirst({ where: { workspaceId: ctxWorkspace, name } });
  if (c) return c;
  return db.transactionCategory.create({ data: { workspaceId: ctxWorkspace, name, type, bucket } });
}
const catExp = await upsertCategory("Makan (contoh)", "expense", "needs");
const catFun = await upsertCategory("Jajan (contoh)", "expense", "wants");
const catInc = await upsertCategory("Gaji (contoh)", "income", "income");

async function upsertTx(dateIso, type, categoryId, amount, note) {
  const exists = await db.transaction.findFirst({ where: { workspaceId: ctxWorkspace, date: dateIso, note } });
  if (exists) return;
  await db.transaction.create({
    data: { workspaceId: ctxWorkspace, createdBy: owner.id, date: dateIso, type, categoryId, amount, note },
  });
}
for (const [list, isThis] of [[dates, true], [lastDates, false]]) {
  await upsertTx(list[0], "expense", catExp.id, 150000, "belanja mingguan (contoh)");
  await upsertTx(list[2], "expense", catFun.id, 45000, "kopi & jajan (contoh)");
  await upsertTx(list[4], "expense", catExp.id, 85000, "transport (contoh)");
  if (isThis) await upsertTx(list[0], "income", catInc.id, 2000000, "gaji (contoh)");
  if (!isThis) await upsertTx(list[3], "expense", catFun.id, 120000, "nonton (contoh)");
}

// Refleksi minggu lalu (owner) — biar riwayat kelihatan terisi
const lastReflection = await db.weeklyReflection.findUnique({
  where: { userId_weekStart: { userId: owner.id, weekStart: wsLast } },
});
if (!lastReflection) {
  await db.weeklyReflection.create({
    data: {
      workspaceId: ctxWorkspace, userId: owner.id, weekStart: wsLast,
      worked: "Ngaji hampir penuh, olahraga konsisten (contoh).",
      blocked: "Coding Senin gagal jalan karena kerjaan menumpuk (contoh).",
      nextAdjustment: "Coding dipindah ke jam malam, coba 20:00 (contoh).",
      weeklySentence: "Minggu yang jujur: nggak semua jalan, tapi arahnya masih benar (contoh).",
      gratitude: "Terima kasih untuk badan yang masih sehat (contoh).",
    },
  });
}

// Target contoh
let target = await db.financialTarget.findFirst({ where: { workspaceId: ctxWorkspace, name: { contains: "contoh" } } });
if (!target) {
  target = await db.financialTarget.create({
    data: { workspaceId: ctxWorkspace, name: "Dana kamera (contoh)", targetAmount: 5000000, currentAmount: 1250000 },
  });
}

console.log("✓ Data contoh siap. Buka aplikasi → menu Refleksi/Review Mingguan.");
console.log(`  Minggu ini: ${ws} · minggu lalu: ${wsLast}`);
await db.$disconnect();
