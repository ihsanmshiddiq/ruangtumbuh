// Data layer server-only: Buku Kas — transaksi, kategori, alokasi, target.
// SEMUA query difilter workspaceId dari konteks sesi — ekuivalen RLS.
// DUA SISTEM KEUANGAN YANG TERPISAH (tidak pernah dicampur di UI):
//  1) Lensa 50/30/20  → interpretasi pengeluaran per bucket (dihitung runtime).
//  2) Alokasi pemasukan 10/20/10/20/40 → pembagian setiap pemasukan (tabel plan).
import { db } from "@/lib/db";
import type { SessionContext } from "@/lib/types";
import { monthStartOf } from "@/lib/dates";

type Ctx = SessionContext;

export type CategoryDTO = {
  id: string; name: string; type: "income" | "expense";
  bucket: "income" | "needs" | "wants" | "charity" | "savings" | "target";
  monthlyTarget: number; active: boolean;
};

export type TransactionDTO = {
  id: string; date: string; type: "income" | "expense"; amount: number;
  categoryId: string; categoryName: string; bucket: string;
  note: string; createdBy: string; createdByName: string;
};

const BUCKETS = ["needs", "wants", "charity", "savings", "target"] as const;
export type Bucket = (typeof BUCKETS)[number];

export async function listCategories(ctx: Ctx): Promise<CategoryDTO[]> {
  const rows = await db.transactionCategory.findMany({
    where: { workspaceId: ctx.workspace.id, active: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  return rows.map((c) => ({
    id: c.id, name: c.name,
    type: c.type as CategoryDTO["type"],
    bucket: c.bucket as CategoryDTO["bucket"],
    monthlyTarget: c.monthlyTarget, active: c.active,
  }));
}

export async function createCategory(
  ctx: Ctx,
  input: { name: string; type: "income" | "expense"; bucket: CategoryDTO["bucket"]; monthlyTarget?: number }
): Promise<CategoryDTO> {
  const row = await db.transactionCategory.create({
    data: {
      workspaceId: ctx.workspace.id,
      name: input.name,
      type: input.type,
      bucket: input.type === "income" ? "income" : input.bucket,
      monthlyTarget: input.monthlyTarget ?? 0,
    },
  });
  return { id: row.id, name: row.name, type: row.type as CategoryDTO["type"], bucket: row.bucket as CategoryDTO["bucket"], monthlyTarget: row.monthlyTarget, active: row.active };
}

/** Kategori tidak boleh dihapus kalau masih dipakai transaksi (nonaktifkan saja). */
export async function deactivateCategory(ctx: Ctx, id: string): Promise<{ ok: boolean; error?: string }> {
  const used = await db.transaction.findFirst({ where: { categoryId: id, workspaceId: ctx.workspace.id } });
  if (used) {
    await db.transactionCategory.update({ where: { id }, data: { active: false } });
    return { ok: true, error: "Kategori masih dipakai transaksi — dinonaktifkan, bukan dihapus." };
  }
  await db.transactionCategory.deleteMany({ where: { id, workspaceId: ctx.workspace.id } });
  return { ok: true };
}

export type TransactionInput = {
  date: string;
  type: "income" | "expense";
  categoryId: string;
  amount: number; // rupiah integer > 0
  note?: string;
};

async function assertCategory(ctx: Ctx, id: string, type: "income" | "expense") {
  const c = await db.transactionCategory.findFirst({
    where: { id, workspaceId: ctx.workspace.id, active: true },
  });
  if (!c) throw new Error("Kategori tidak ditemukan.");
  if (c.type !== type) throw new Error("Jenis kategori tidak cocok dengan jenis transaksi.");
}

export async function createTransaction(ctx: Ctx, input: TransactionInput): Promise<TransactionDTO> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("Nominal harus angka bulat lebih dari 0.");
  await assertCategory(ctx, input.categoryId, input.type);
  const row = await db.transaction.create({
    data: {
      workspaceId: ctx.workspace.id,
      createdBy: ctx.user.id,
      date: input.date,
      type: input.type,
      categoryId: input.categoryId,
      amount: input.amount,
      note: input.note ?? "",
    },
  });
  return (await getTransaction(ctx, row.id))!;
}

export async function updateTransaction(
  ctx: Ctx,
  id: string,
  input: Partial<TransactionInput>
): Promise<TransactionDTO | null> {
  const existing = await db.transaction.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!existing) return null;
  if (input.categoryId && input.type) await assertCategory(ctx, input.categoryId, input.type);
  await db.transaction.update({
    where: { id: existing.id },
    data: {
      ...(input.date !== undefined ? { date: input.date } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
  });
  return getTransaction(ctx, id);
}

export async function deleteTransaction(ctx: Ctx, id: string): Promise<boolean> {
  const existing = await db.transaction.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!existing) return false;
  await db.transaction.delete({ where: { id: existing.id } });
  return true;
}

export async function getTransaction(ctx: Ctx, id: string): Promise<TransactionDTO | null> {
  const row = await db.transaction.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
  });
  return row ? dtoFromRow(ctx, row) : null;
}

async function dtoFromRow(ctx: Ctx, row: {
  id: string; date: string; type: string; amount: number; categoryId: string;
  note: string; createdBy: string;
}): Promise<TransactionDTO> {
  const [cat, members] = await Promise.all([
    db.transactionCategory.findFirst({ where: { id: row.categoryId } }),
    db.workspaceMember.findMany({
      where: { workspaceId: ctx.workspace.id },
      include: { user: { select: { displayName: true } } },
    }),
  ]);
  const nameById = new Map(members.map((m) => [m.userId, m.user.displayName]));
  return {
    id: row.id, date: row.date,
    type: row.type as "income" | "expense",
    amount: row.amount,
    categoryId: row.categoryId,
    categoryName: cat?.name ?? "—",
    bucket: cat?.bucket ?? "needs",
    note: row.note,
    createdBy: row.createdBy,
    createdByName: nameById.get(row.createdBy) ?? "Anggota",
  };
}

export type MonthSummary = {
  month: string;
  income: number;
  expense: number;
  balance: number;
  byBucket: Record<Bucket, number>; // pengeluaran per bucket (lensa 50/30/20)
  byCategory: { categoryId: string; name: string; bucket: string; type: string; total: number }[];
  txCount: number;
};

/** Ringkasan bulan: pemasukan, pengeluaran, saldo, komposisi per bucket. */
export async function getMonthSummary(ctx: Ctx, month: string): Promise<MonthSummary> {
  const from = monthStartOf(`${month}-01`);
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;
  const rows = await db.transaction.findMany({
    where: { workspaceId: ctx.workspace.id, date: { gte: from, lte: to } },
  });
  const cats = await listCategories(ctx);
  const catById = new Map(cats.map((c) => [c.id, c]));

  let income = 0, expense = 0;
  const byBucket: Record<Bucket, number> = { needs: 0, wants: 0, charity: 0, savings: 0, target: 0 };
  const catTotals = new Map<string, number>();
  for (const t of rows) {
    if (t.type === "income") income += t.amount;
    else {
      expense += t.amount;
      const c = catById.get(t.categoryId);
      if (c && (BUCKETS as readonly string[]).includes(c.bucket)) {
        byBucket[c.bucket as Bucket] += t.amount;
      }
      catTotals.set(t.categoryId, (catTotals.get(t.categoryId) ?? 0) + t.amount);
    }
  }
  const byCategory = [...catTotals.entries()]
    .map(([categoryId, total]) => ({
      categoryId,
      name: catById.get(categoryId)?.name ?? "—",
      bucket: catById.get(categoryId)?.bucket ?? "needs",
      type: "expense",
      total,
    }))
    .sort((a, b) => b.total - a.total);

  return { month, income, expense, balance: income - expense, byBucket, byCategory, txCount: rows.length };
}

/** Daftar transaksi sebulan (urut tanggal terbaru) — batch, tanpa N+1. */
export async function listMonthTransactions(ctx: Ctx, month: string): Promise<TransactionDTO[]> {
  const from = monthStartOf(`${month}-01`);
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;
  const [rows, cats, members] = await Promise.all([
    db.transaction.findMany({
      where: { workspaceId: ctx.workspace.id, date: { gte: from, lte: to } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    db.transactionCategory.findMany({ where: { workspaceId: ctx.workspace.id } }),
    db.workspaceMember.findMany({
      where: { workspaceId: ctx.workspace.id },
      include: { user: { select: { displayName: true } } },
    }),
  ]);
  const catById = new Map(cats.map((c) => [c.id, c]));
  const nameById = new Map(members.map((mb) => [mb.userId, mb.user.displayName]));
  return rows.map((r) => ({
    id: r.id, date: r.date,
    type: r.type as "income" | "expense",
    amount: r.amount,
    categoryId: r.categoryId,
    categoryName: catById.get(r.categoryId)?.name ?? "—",
    bucket: catById.get(r.categoryId)?.bucket ?? "needs",
    note: r.note,
    createdBy: r.createdBy,
    createdByName: nameById.get(r.createdBy) ?? "Anggota",
  }));
}

/* ── Alokasi pemasukan (10/20/10/20/40) — sistem kedua, terpisah ─────── */

export type AllocationPlanDTO = {
  needsPercent: number; wantsPercent: number; charityPercent: number;
  savingsPercent: number; targetPercent: number;
};

export async function getAllocationPlan(ctx: Ctx): Promise<AllocationPlanDTO> {
  let row = await db.allocationPlan.findUnique({ where: { workspaceId: ctx.workspace.id } });
  if (!row) {
    row = await db.allocationPlan.create({ data: { workspaceId: ctx.workspace.id } });
  }
  return {
    needsPercent: row.needsPercent, wantsPercent: row.wantsPercent,
    charityPercent: row.charityPercent, savingsPercent: row.savingsPercent,
    targetPercent: row.targetPercent,
  };
}

export async function updateAllocationPlan(ctx: Ctx, input: AllocationPlanDTO): Promise<{ ok: boolean; error?: string }> {
  const total = input.needsPercent + input.wantsPercent + input.charityPercent + input.savingsPercent + input.targetPercent;
  if (total !== 100) return { ok: false, error: `Total alokasi harus 100% (sekarang ${total}%).` };
  for (const v of Object.values(input)) {
    if (!Number.isInteger(v) || v < 0 || v > 100) return { ok: false, error: "Persentase harus bilangan bulat 0–100." };
  }
  await db.allocationPlan.upsert({
    where: { workspaceId: ctx.workspace.id },
    create: { workspaceId: ctx.workspace.id, ...input },
    update: { ...input },
  });
  return { ok: true };
}

/** Pembagian pemasukan bulan ini menurut rencana alokasi. */
export async function getAllocationForMonth(ctx: Ctx, month: string) {
  const plan = await getAllocationPlan(ctx);
  const { income } = await getMonthSummary(ctx, month);
  const parts = [
    { key: "needs", label: "Kebutuhan", percent: plan.needsPercent },
    { key: "wants", label: "Keinginan", percent: plan.wantsPercent },
    { key: "charity", label: "Sedekah", percent: plan.charityPercent },
    { key: "savings", label: "Tabungan", percent: plan.savingsPercent },
    { key: "target", label: "Dana target", percent: plan.targetPercent },
  ] as const;
  const items = parts.map((p) => ({
    ...p,
    amount: Math.floor((income * p.percent) / 100),
  }));
  // sisa pembulatan masuk ke bucket terbesar agar total pas
  const allocated = items.reduce((s, i) => s + i.amount, 0);
  const remainder = income - allocated;
  if (remainder !== 0 && items.length > 0) {
    const biggest = items.reduce((a, b) => (b.percent > a.percent ? b : a));
    biggest.amount += remainder;
  }
  return { plan, income, items };
}

/* ── Dana target ─────────────────────────────────────────────────────── */

export type TargetDTO = {
  id: string; name: string; targetAmount: number; currentAmount: number;
  percent: number; remaining: number;
};

export async function listTargets(ctx: Ctx): Promise<TargetDTO[]> {
  const rows = await db.financialTarget.findMany({
    where: { workspaceId: ctx.workspace.id, active: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((t) => ({
    id: t.id, name: t.name, targetAmount: t.targetAmount, currentAmount: t.currentAmount,
    percent: t.targetAmount > 0 ? Math.min(100, Math.round((t.currentAmount / t.targetAmount) * 100)) : 0,
    remaining: Math.max(0, t.targetAmount - t.currentAmount),
  }));
}

export async function createTarget(ctx: Ctx, input: { name: string; targetAmount: number }): Promise<TargetDTO> {
  if (!Number.isInteger(input.targetAmount) || input.targetAmount <= 0) throw new Error("Nominal target harus lebih dari 0.");
  const row = await db.financialTarget.create({
    data: { workspaceId: ctx.workspace.id, name: input.name, targetAmount: input.targetAmount },
  });
  return {
    id: row.id, name: row.name, targetAmount: row.targetAmount, currentAmount: row.currentAmount,
    percent: 0, remaining: row.targetAmount,
  };
}

/** Tambah dana ke target (setoran). */
export async function contributeTarget(ctx: Ctx, id: string, amount: number): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, error: "Nominal setor harus lebih dari 0." };
  const t = await db.financialTarget.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!t) return { ok: false, error: "Target tidak ditemukan." };
  await db.financialTarget.update({ where: { id: t.id }, data: { currentAmount: t.currentAmount + amount } });
  return { ok: true };
}

export async function deleteTarget(ctx: Ctx, id: string): Promise<boolean> {
  const t = await db.financialTarget.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!t) return false;
  await db.financialTarget.delete({ where: { id: t.id } });
  return true;
}
