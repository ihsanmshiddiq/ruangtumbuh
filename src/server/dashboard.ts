// Data ringkas untuk beranda bersama. Perencanaan dapat dibaca berdua, tetapi
// angka keuangan hanya boleh kembali ke pemilik sesi.
import type { SessionContext } from "@/lib/types";
import { isISODate, monthKey, weekStartOf } from "@/lib/dates";
import { getSupabaseFor, unwrap } from "@/server/db";
import { ensureWeekPlanned, getWeek, type WeekView } from "@/server/planner";

export type PersonalMoneySummary = {
  income: number;
  expense: number;
  balance: number;
  txCount: number;
};

export type DashboardPayload = {
  date: string;
  month: string;
  week: WeekView;
  finance: PersonalMoneySummary;
};

function emptyMoney(): PersonalMoneySummary {
  return { income: 0, expense: 0, balance: 0, txCount: 0 };
}

function monthRange(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export async function getDashboard(ctx: SessionContext, requestedDate: string): Promise<DashboardPayload> {
  const date = isISODate(requestedDate) ? requestedDate : new Date().toISOString().slice(0, 10);
  const month = monthKey(new Date(`${date}T00:00:00`));
  const { from, to } = monthRange(month);
  const sb = await getSupabaseFor(ctx);

  // Hanya rencana milik pengguna aktif yang boleh dibuat otomatis. Rencana
  // pasangan tetap terbaca penuh, tetapi tidak pernah dibuat/diubah atas namanya.
  const weekStart = weekStartOf(date);
  await ensureWeekPlanned(ctx, weekStart);

  const [week, transactionRows] = await Promise.all([
    getWeek(ctx, weekStart),
    sb
      .from("transactions")
      .select("created_by, type, amount")
      .eq("workspace_id", ctx.workspace.id)
      .eq("created_by", ctx.user.id)
      .gte("date", from)
      .lte("date", to),
  ]);

  const finance = emptyMoney();
  const rows = (unwrap(transactionRows) ?? []) as { created_by: string; type: string; amount: number }[];
  for (const row of rows) {
    // Defense in depth: query dan payload hanya memproses transaksi sendiri.
    if (row.created_by !== ctx.user.id) continue;
    const amount = Number(row.amount) || 0;
    finance.txCount += 1;
    if (row.type === "income") {
      finance.income += amount;
    } else {
      finance.expense += amount;
    }
  }
  finance.balance = finance.income - finance.expense;

  return { date, month, week, finance };
}
