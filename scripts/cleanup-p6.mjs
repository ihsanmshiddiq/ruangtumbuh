// Bersihkan data uji [P6] (Fase 6) dari database lokal. Sekali pakai.
// Jalankan: bun scripts/cleanup-p6.mjs
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const notes = await db.note.deleteMany({ where: { title: { contains: "[P6]" } } });
const acts = await db.activity.deleteMany({ where: { name: { contains: "[P6]" } } });
const logs = await db.activityLog.deleteMany({ where: { note: { contains: "[P6]" } } });
const msgs = await db.message.deleteMany({ where: { content: { contains: "[P6]" } } });
const refl = await db.weeklyReflection.deleteMany({ where: { worked: { contains: "[P6]" } } });
const cats = await db.transactionCategory.deleteMany({ where: { name: { contains: "[P6]" } } });
console.log("Data uji dibersihkan:", JSON.stringify({ notes, acts, logs, msgs, refl, cats }));
await db.$disconnect();
