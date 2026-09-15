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

export type AllocationItemDTO = { id: string; label: string; percent: number };

const DEFAULT_ALLOC: { label: string; percent: number }[] = [
  { label: "Kebutuhan", percent: 10 },
  { label: "Keinginan", percent: 20 },
  { label: "Sedekah", percent: 10 },
  { label: "Tabungan", percent: 20 },
  { label: "Dana target", percent: 40 },
];

export const ALLOC_LIMITS = { min: 1, max: 12, labelMax: 40 };

/** Daftar pos alokasi workspace; workspace baru otomatis diisi bawaan 10/20/10/20/40. */
export async function getAllocationItems(ctx: Ctx): Promise<AllocationItemDTO[]> {
  let rows = await db.allocationItem.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  if (rows.length === 0) {
    await db.allocationItem.createMany({
      data: DEFAULT_ALLOC.map((d, i) => ({
        workspaceId: ctx.workspace.id, label: d.label, percent: d.percent, position: i,
      })),
    });
    rows = await db.allocationItem.findMany({
      where: { workspaceId: ctx.workspace.id },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
  }
  return rows.map((r) => ({ id: r.id, label: r.label, percent: r.percent }));
}

/**
 * Simpan daftar pos alokasi (tambah/hapus/ganti nama/ubah persen).
 * Strategi: ganti semua baris dalam satu transaksi — jumlah pos kecil,
 * id baru dikembalikan ke client. Aturan: total WAJIB 100.
 */
export async function updateAllocationItems(
  ctx: Ctx,
  items: { label: string; percent: number }[],
): Promise<{ ok: boolean; error?: string }> {
  if (!Array.isArray(items) || items.length < ALLOC_LIMITS.min || items.length > ALLOC_LIMITS.max) {
    return { ok: false, error: `Pos alokasi harus ${ALLOC_LIMITS.min}–${ALLOC_LIMITS.max} baris.` };
  }
  const seen = new Set<string>();
  let total = 0;
  for (const it of items) {
    const label = typeof it.label === "string" ? it.label.trim() : "";
    if (!label) return { ok: false, error: "Nama pos alokasi tidak boleh kosong." };
    if (label.length > ALLOC_LIMITS.labelMax) return { ok: false, error: `Nama pos maksimal ${ALLOC_LIMITS.labelMax} karakter.` };
    const key = label.toLowerCase();
    if (seen.has(key)) return { ok: false, error: `Nama pos "${label}" kembar — pakai nama berbeda.` };
    seen.add(key);
    if (!Number.isInteger(it.percent) || it.percent < 0 || it.percent > 100) {
      return { ok: false, error: `Persentase "${label}" harus bilangan bulat 0–100.` };
    }
    total += it.percent;
  }
  if (total !== 100) return { ok: false, error: `Total alokasi harus 100% (sekarang ${total}%).` };

  await db.$transaction(async (tx) => {
    await tx.allocationItem.deleteMany({ where: { workspaceId: ctx.workspace.id } });
    await tx.allocationItem.createMany({
      data: items.map((it, i) => ({
        workspaceId: ctx.workspace.id,
        label: it.label.trim(),
        percent: it.percent,
        position: i,
      })),
    });
  });
  return { ok: true };
}

/** Pembagian pemasukan bulan ini menurut daftar pos alokasi. */
export async function getAllocationForMonth(ctx: Ctx, month: string) {
  const items = await getAllocationItems(ctx);
  const { income } = await getMonthSummary(ctx, month);
  const parts = items.map((it) => ({
    key: it.id,
    label: it.label,
    percent: it.percent,
    amount: Math.floor((income * it.percent) / 100),
  }));
  // sisa pembulatan masuk ke pos terbesar agar total pas
  const allocated = parts.reduce((s, i) => s + i.amount, 0);
  const remainder = income - allocated;
  if (remainder !== 0 && parts.length > 0) {
    const biggest = parts.reduce((a, b) => (b.percent > a.percent ? b : a));
    biggest.amount += remainder;
  }
  return { items: parts, income };
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
