// Bersihkan seluruh data uji [P5] + [SMOKE] dari database sandbox. Sekali pakai.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const like = (mark) => ({ contains: mark });
let deleted = { acts: 0, logs: 0, cats: 0, tx: 0, msgs: 0, refl: 0, energy: 0, targets: 0 };

const acts = await db.activity.findMany({ where: { OR: [{ name: like("[P5]") }, { name: like("[SMOKE]") }] }, select: { id: true } });
for (const a of acts) { await db.activity.delete({ where: { id: a.id } }); deleted.acts++; }

const cats = await db.transactionCategory.findMany({ where: { OR: [{ name: like("[P5]") }, { name: like("[SMOKE]") }] }, select: { id: true } });
for (const c of cats) {
  const txs = await db.transaction.findMany({ where: { categoryId: c.id }, select: { id: true } });
  for (const t of txs) { await db.transaction.delete({ where: { id: t.id } }); deleted.tx++; }
  await db.transactionCategory.delete({ where: { id: c.id } }); deleted.cats++;
}

const txs = await db.transaction.findMany({ where: { note: like("[P5]") }, select: { id: true } });
for (const t of txs) { await db.transaction.delete({ where: { id: t.id } }); deleted.tx++; }
const txs2 = await db.transaction.findMany({ where: { note: like("[SMOKE]") }, select: { id: true } });
for (const t of txs2) { await db.transaction.delete({ where: { id: t.id } }); deleted.tx++; }

const msgs = await db.message.findMany({ where: { OR: [{ content: like("[P5]") }, { content: like("[SMOKE]") }] }, select: { id: true } });
for (const m of msgs) { await db.message.delete({ where: { id: m.id } }); deleted.msgs++; }

const refls = await db.weeklyReflection.findMany({ where: { OR: [{ worked: like("[P5]") }, { blocked: like("[P5]") }, { worked: like("[SMOKE]") }, { blocked: like("[SMOKE]") }] }, select: { id: true } });
for (const r of refls) { await db.weeklyReflection.delete({ where: { id: r.id } }); deleted.refl++; }

const targets = await db.financialTarget.findMany({ where: { OR: [{ name: like("[P5]") }, { name: like("[SMOKE]") }] }, select: { id: true } });
for (const t of targets) { await db.financialTarget.delete({ where: { id: t.id } }); deleted.targets++; }

console.log("Data uji dibersihkan:", JSON.stringify(deleted));
await db.$disconnect();
