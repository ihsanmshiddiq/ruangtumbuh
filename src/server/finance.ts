// Data layer server-only: Buku Kas — transaksi, kategori, alokasi, target.
// Semua query lewat klien pengguna — RLS Supabase menegakkan batas workspace.
// DUA SISTEM KEUANGAN YANG TERPISAH (tidak pernah dicampur di UI):
//  1) Lensa 50/30/20  → interpretasi pengeluaran per bucket (dihitung runtime).
//  2) Alokasi pemasukan ber-pos bebas → pembagian setiap pemasukan (tabel items).
import type { SessionContext } from "@/lib/types";
import { monthStartOf } from "@/lib/dates";
import { getSupabaseFor, unwrap, memberNameMap } from "@/server/db";

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

type CategoryRow = {
  id: string; name: string; type: string; bucket: string;
  monthly_target: number; active: boolean;
};

type TxRow = {
  id: string; date: string; type: string; amount: number;
  category_id: string; note: string; created_by: string;
  transaction_categories: { name: string; bucket: string } | null;
};

function catDTO(c: CategoryRow): CategoryDTO {
  return {
    id: c.id, name: c.name,
    type: c.type as CategoryDTO["type"],
    bucket: c.bucket as CategoryDTO["bucket"],
    monthlyTarget: c.monthly_target, active: c.active,
  };
}

function txDTO(r: TxRow, nameById: Map<string, string>): TransactionDTO {
  return {
    id: r.id, date: r.date,
    type: r.type as "income" | "expense",
    amount: r.amount,
    categoryId: r.category_id,
    categoryName: r.transaction_categories?.name ?? "—",
    bucket: r.transaction_categories?.bucket ?? "needs",
    note: r.note,
    createdBy: r.created_by,
    createdByName: nameById.get(r.created_by) ?? "Anggota",
  };
}

const CAT_SELECT = "id, name, type, bucket, monthly_target, active";
const TX_SELECT =
  "id, date, type, amount, category_id, note, created_by, transaction_categories ( name, bucket )";

export async function listCategories(ctx: Ctx): Promise<CategoryDTO[]> {
  const sb = await getSupabaseFor(ctx);
  const rows = unwrap(
    await sb
      .from("transaction_categories")
      .select(CAT_SELECT)
      .eq("workspace_id", ctx.workspace.id)
      .eq("active", true)
      .order("type", { ascending: true })
      .order("name", { ascending: true })
  ) as unknown as CategoryRow[];
  return rows.map(catDTO);
}

export async function createCategory(
  ctx: Ctx,
  input: { name: string; type: "income" | "expense"; bucket: CategoryDTO["bucket"]; monthlyTarget?: number }
): Promise<CategoryDTO> {
  const sb = await getSupabaseFor(ctx);
  const row = unwrap(
    await sb
      .from("transaction_categories")
      .insert({
        workspace_id: ctx.workspace.id,
        name: input.name,
        type: input.type,
        bucket: input.type === "income" ? "income" : input.bucket,
        monthly_target: input.monthlyTarget ?? 0,
      })
      .select(CAT_SELECT)
      .single()
  ) as unknown as CategoryRow;
  return catDTO(row);
}

/** Kategori tidak boleh dihapus kalau masih dipakai transaksi (nonaktifkan saja). */
export async function deactivateCategory(ctx: Ctx, id: string): Promise<{ ok: boolean; error?: string }> {
  const sb = await getSupabaseFor(ctx);
  const used = unwrap(
    await sb
      .from("transactions")
      .select("id")
      .eq("category_id", id)
      .eq("workspace_id", ctx.workspace.id)
      .limit(1)
      .maybeSingle()
  );
  if (used) {
    await sb.from("transaction_categories").update({ active: false }).eq("id", id).eq("workspace_id", ctx.workspace.id);
    return { ok: true, error: "Kategori masih dipakai transaksi — dinonaktifkan, bukan dihapus." };
  }
  await sb.from("transaction_categories").delete().eq("id", id).eq("workspace_id", ctx.workspace.id);
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
  const sb = await getSupabaseFor(ctx);
  const c = unwrap(
    await sb
      .from("transaction_categories")
      .select("id, type")
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .eq("active", true)
      .maybeSingle()
  ) as { id: string; type: string } | null;
  if (!c) throw new Error("Kategori tidak ditemukan.");
  if (c.type !== type) throw new Error("Jenis kategori tidak cocok dengan jenis transaksi.");
}

async function nameMap(ctx: Ctx): Promise<Map<string, string>> {
  const sb = await getSupabaseFor(ctx);
  return memberNameMap(sb, ctx.workspace.id);
}

export async function createTransaction(ctx: Ctx, input: TransactionInput): Promise<TransactionDTO> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("Nominal harus angka bulat lebih dari 0.");
  await assertCategory(ctx, input.categoryId, input.type);
  const sb = await getSupabaseFor(ctx);
  const row = unwrap(
    await sb
      .from("transactions")
      .insert({
        workspace_id: ctx.workspace.id,
        created_by: ctx.user.id, // dari sesi — RLS menegakkan juga
        date: input.date,
        type: input.type,
        category_id: input.categoryId,
        amount: input.amount,
        note: input.note ?? "",
      })
      .select(TX_SELECT)
      .single()
  ) as unknown as TxRow;
  return txDTO(row, await nameMap(ctx));
}

export async function updateTransaction(
  ctx: Ctx,
  id: string,
  input: Partial<TransactionInput>
): Promise<TransactionDTO | null> {
  const sb = await getSupabaseFor(ctx);
  if (input.categoryId && input.type) await assertCategory(ctx, input.categoryId, input.type);
  const data: Record<string, unknown> = {};
  if (input.date !== undefined) data.date = input.date;
  if (input.type !== undefined) data.type = input.type;
  if (input.categoryId !== undefined) data.category_id = input.categoryId;
  if (input.amount !== undefined) data.amount = input.amount;
  if (input.note !== undefined) data.note = input.note;
  const rows = unwrap(
    await sb
      .from("transactions")
      .update(data)
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .select(TX_SELECT)
  ) as unknown as TxRow[];
  return rows[0] ? txDTO(rows[0], await nameMap(ctx)) : null;
}

export async function deleteTransaction(ctx: Ctx, id: string): Promise<boolean> {
  const sb = await getSupabaseFor(ctx);
  const rows = unwrap(
    await sb
      .from("transactions")
      .delete()
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .select("id")
  ) as { id: string }[];
  return rows.length > 0;
}

export async function getTransaction(ctx: Ctx, id: string): Promise<TransactionDTO | null> {
  const sb = await getSupabaseFor(ctx);
  const rows = unwrap(
    await sb
      .from("transactions")
      .select(TX_SELECT)
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .limit(1)
  ) as unknown as TxRow[];
  return rows[0] ? txDTO(rows[0], await nameMap(ctx)) : null;
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

function monthRange(month: string): { from: string; to: string } {
  const from = monthStartOf(`${month}-01`);
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

/** Ringkasan bulan: pemasukan, pengeluaran, saldo, komposisi per bucket. */
export async function getMonthSummary(ctx: Ctx, month: string): Promise<MonthSummary> {
  const { from, to } = monthRange(month);
  const sb = await getSupabaseFor(ctx);
  const [txRows, cats] = await Promise.all([
    sb.from("transactions").select("date, type, amount, category_id").eq("workspace_id", ctx.workspace.id).gte("date", from).lte("date", to),
    listCategories(ctx),
  ]);
  const rows = (unwrap(txRows) ?? []) as unknown as { date: string; type: string; amount: number; category_id: string }[];
  const catById = new Map(cats.map((c) => [c.id, c]));

  let income = 0, expense = 0;
  const byBucket: Record<Bucket, number> = { needs: 0, wants: 0, charity: 0, savings: 0, target: 0 };
  const catTotals = new Map<string, number>();
  for (const t of rows) {
    if (t.type === "income") income += t.amount;
    else {
      expense += t.amount;
      const c = catById.get(t.category_id);
      if (c && (BUCKETS as readonly string[]).includes(c.bucket)) {
        byBucket[c.bucket as Bucket] += t.amount;
      }
      catTotals.set(t.category_id, (catTotals.get(t.category_id) ?? 0) + t.amount);
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
  const { from, to } = monthRange(month);
  const sb = await getSupabaseFor(ctx);
  const [rows, cats] = await Promise.all([
    sb
      .from("transactions")
      .select(TX_SELECT)
      .eq("workspace_id", ctx.workspace.id)
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    sb.from("transaction_categories").select(CAT_SELECT).eq("workspace_id", ctx.workspace.id),
  ]);
  const txs = (unwrap(rows) ?? []) as unknown as TxRow[];
  const catById = new Map(
    ((unwrap(cats) ?? []) as unknown as CategoryRow[]).map((c) => [c.id, c])
  );
  const nameById = await nameMap(ctx);
  return txs.map((r) => {
    const cat = catById.get(r.category_id);
    return {
      id: r.id, date: r.date,
      type: r.type as "income" | "expense",
      amount: r.amount,
      categoryId: r.category_id,
      categoryName: cat?.name ?? "—",
      bucket: cat?.bucket ?? "needs",
      note: r.note,
      createdBy: r.created_by,
      createdByName: nameById.get(r.created_by) ?? "Anggota",
    };
  });
}

/* ── Alokasi pemasukan (pos bebas) — sistem kedua, terpisah ──────────── */

export type AllocationItemDTO = { id: string; label: string; percent: number };

const DEFAULT_ALLOC: { label: string; percent: number }[] = [
  { label: "Kebutuhan", percent: 10 },
  { label: "Keinginan", percent: 20 },
  { label: "Sedekah", percent: 10 },
  { label: "Tabungan", percent: 20 },
  { label: "Dana target", percent: 40 },
];

export const ALLOC_LIMITS = { min: 1, max: 12, labelMax: 40 };

type AllocRow = { id: string; label: string; percent: number };

/** Daftar pos alokasi workspace; workspace baru otomatis diisi bawaan. */
export async function getAllocationItems(ctx: Ctx): Promise<AllocationItemDTO[]> {
  const sb = await getSupabaseFor(ctx);
  let rows = (unwrap(
    await sb
      .from("allocation_items")
      .select("id, label, percent")
      .eq("workspace_id", ctx.workspace.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
  ) ?? []) as unknown as AllocRow[];
  if (rows.length === 0) {
    await sb.from("allocation_items").insert(
      DEFAULT_ALLOC.map((d, i) => ({
        workspace_id: ctx.workspace.id, label: d.label, percent: d.percent, position: i,
      }))
    );
    rows = (unwrap(
      await sb
        .from("allocation_items")
        .select("id, label, percent")
        .eq("workspace_id", ctx.workspace.id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true })
    ) ?? []) as unknown as AllocRow[];
  }
  return rows;
}

/**
 * Simpan daftar pos alokasi (tambah/hapus/ganti nama/ubah persen).
 * Strategi: hapus semua lalu insert ulang — jumlah pos kecil, operasi cepat.
 * Aturan: total WAJIB 100.
 */
export async function updateAllocationItems(
  ctx: Ctx,
  items: { label: string; percent: number }[]
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

  const sb = await getSupabaseFor(ctx);
  await sb.from("allocation_items").delete().eq("workspace_id", ctx.workspace.id);
  const res = await sb.from("allocation_items").insert(
    items.map((it, i) => ({
      workspace_id: ctx.workspace.id,
      label: it.label.trim(),
      percent: it.percent,
      position: i,
    }))
  );
  if (res.error) {
    // Insert gagal setelah delete — pulihkan bawaan agar workspace tidak kosong.
    await sb.from("allocation_items").insert(
      DEFAULT_ALLOC.map((d, i) => ({
        workspace_id: ctx.workspace.id, label: d.label, percent: d.percent, position: i,
      }))
    );
    throw new Error(res.error.message);
  }
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
  const sb = await getSupabaseFor(ctx);
  const rows = (unwrap(
    await sb
      .from("financial_targets")
      .select("id, name, target_amount, current_amount")
      .eq("workspace_id", ctx.workspace.id)
      .eq("active", true)
      .order("created_at", { ascending: true })
  ) ?? []) as unknown as { id: string; name: string; target_amount: number; current_amount: number }[];
  return rows.map((t) => ({
    id: t.id, name: t.name, targetAmount: t.target_amount, currentAmount: t.current_amount,
    percent: t.target_amount > 0 ? Math.min(100, Math.round((t.current_amount / t.target_amount) * 100)) : 0,
    remaining: Math.max(0, t.target_amount - t.current_amount),
  }));
}

export async function createTarget(ctx: Ctx, input: { name: string; targetAmount: number }): Promise<TargetDTO> {
  if (!Number.isInteger(input.targetAmount) || input.targetAmount <= 0) throw new Error("Nominal target harus lebih dari 0.");
  const sb = await getSupabaseFor(ctx);
  const row = unwrap(
    await sb
      .from("financial_targets")
      .insert({ workspace_id: ctx.workspace.id, name: input.name, target_amount: input.targetAmount })
      .select("id, name, target_amount, current_amount")
      .single()
  ) as unknown as { id: string; name: string; target_amount: number; current_amount: number };
  return {
    id: row.id, name: row.name, targetAmount: row.target_amount, currentAmount: row.current_amount,
    percent: 0, remaining: row.target_amount,
  };
}

/** Tambah dana ke target (setoran). */
export async function contributeTarget(ctx: Ctx, id: string, amount: number): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, error: "Nominal setor harus lebih dari 0." };
  const sb = await getSupabaseFor(ctx);
  const t = unwrap(
    await sb
      .from("financial_targets")
      .select("id, current_amount")
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .maybeSingle()
  ) as { id: string; current_amount: number } | null;
  if (!t) return { ok: false, error: "Target tidak ditemukan." };
  await sb.from("financial_targets").update({ current_amount: t.current_amount + amount }).eq("id", t.id);
  return { ok: true };
}

export async function deleteTarget(ctx: Ctx, id: string): Promise<boolean> {
  const sb = await getSupabaseFor(ctx);
  const rows = unwrap(
    await sb
      .from("financial_targets")
      .delete()
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .select("id")
  ) as { id: string }[];
  return rows.length > 0;
}
