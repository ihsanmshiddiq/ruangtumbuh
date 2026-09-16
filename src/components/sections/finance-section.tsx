"use client";

// BUKU KAS PRIBADI — transaksi dan ringkasan hanya untuk pemilik sesi.
// Prioritas Fase 3: tambah transaksi 1 tangan (jenis → nominal → kategori →
// tanggal → catatan), ringkasan jelas, alokasi ≠ lensa 50/30/20 (dijelaskan).
import { useMemo, useState } from "react";
import { Plus, Search, Wallet, ArrowDownLeft, ArrowUpRight, Target, TrendingUp, TrendingDown, Scale, ChevronLeft, ChevronRight, PlusCircle, Trash2, CalendarRange } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { SectionHeader, EmptyState, Panel, TinySpinner } from "@/components/shared/ui-bits";
import { useApi, apiFetch } from "@/lib/client";
import { rupiah } from "@/lib/format";
import { monthKey, addMonths, monthLabel, tanggalPendek } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type {
  MonthSummary, TransactionDTO, CategoryDTO, TargetDTO,
} from "@/server/finance";

type FinancePayload = {
  month: string;
  summary: MonthSummary;
  transactions: TransactionDTO[];
  categories: CategoryDTO[];
  allocation: {
    income: number;
    items: { key: string; label: string; percent: number; amount: number }[];
  };
  targets: TargetDTO[];
  allTime: { income: number; expense: number; balance: number; txCount: number };
};

const TYPE_LABEL: Record<string, string> = { income: "masuk", expense: "keluar" };

export function FinanceSection() {
  const { toast } = useToast();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const { data, error, loading, refetch } = useApi<FinancePayload>(`/api/finance?month=${month}`);

  const [formOpen, setFormOpen] = useState(false);
  const [editTx, setEditTx] = useState<TransactionDTO | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [deletingRange, setDeletingRange] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showAllocTools, setShowAllocTools] = useState(false);
  const [showCatManager, setShowCatManager] = useState(false);
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const [tName, setTName] = useState("");
  const [tAmount, setTAmount] = useState("");
  const [savingTarget, setSavingTarget] = useState(false);
  const [deletingTarget, setDeletingTarget] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.transactions ?? []).filter((t) => {
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (q && !`${t.note} ${t.categoryName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, search, typeFilter]);

  const thisMonth = monthKey(new Date());
  const rangeMatches = useMemo(() => {
    if (!rangeFrom || !rangeTo || rangeFrom > rangeTo) return [];
    return (data?.transactions ?? []).filter((t) => t.date >= rangeFrom && t.date <= rangeTo);
  }, [data, rangeFrom, rangeTo]);

  function openRangeDelete() {
    const [year, monthNumber] = month.split("-").map(Number);
    setRangeFrom(`${month}-01`);
    setRangeTo(`${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, "0")}`);
    setRangeOpen(true);
  }

  async function deleteRange() {
    if (!rangeFrom || !rangeTo || rangeFrom > rangeTo) {
      toast({ title: "Pilih rentang tanggal yang valid." });
      return;
    }
    if (rangeMatches.length === 0) {
      toast({ title: "Tidak ada transaksi pada rentang ini." });
      return;
    }
    const confirmed = window.confirm(
      `Hapus ${rangeMatches.length} transaksi dari ${rangeFrom} sampai ${rangeTo}? Tindakan ini tidak dapat dibatalkan.`
    );
    if (!confirmed) return;
    setDeletingRange(true);
    try {
      const result = await apiFetch<{ deleted: number }>(
        `/api/transactions?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`,
        { method: "DELETE" }
      );
      setRangeOpen(false);
      toast({ title: `${result.deleted} transaksi dihapus` });
      await refetch();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Gagal menghapus transaksi." });
    } finally {
      setDeletingRange(false);
    }
  }

  async function afterSave(msg: string) {
    setFormOpen(false);
    setEditTx(null);
    toast({ title: msg });
    await refetch();
  }

  async function deleteTx(tx: TransactionDTO) {
    try {
      await apiFetch(`/api/transactions/${tx.id}`, { method: "DELETE" });
      toast({ title: "Transaksi dihapus" });
      await refetch();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Gagal menghapus." });
    }
  }

  async function contribute(t: TargetDTO) {
    const raw = window.prompt(`Setor berapa ke "${t.name}"? (angka, contoh 50000)`);
    if (!raw) return;
    const amount = Number(raw.replace(/\D/g, ""));
    if (!Number.isInteger(amount) || amount <= 0) {
      toast({ title: "Nominal tidak valid." });
      return;
    }
    try {
      await apiFetch("/api/targets", {
        method: "PUT",
        body: JSON.stringify({ id: t.id, contribute: amount }),
      });
      toast({ title: `${rupiah(amount)} masuk ke ${t.name}` });
      await refetch();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Gagal setor." });
    }
  }

  function beginEditTarget(t: TargetDTO) {
    setEditingTarget(t.id);
    setTName(t.name);
    setTAmount(String(t.targetAmount));
  }

  async function saveTargetEdit(t: TargetDTO) {
    setSavingTarget(true);
    try {
      await apiFetch(`/api/targets/${t.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: tName.trim(), targetAmount: Number(tAmount.replace(/\D/g, "")) }),
      });
      toast({ title: "Target diperbarui" });
      setEditingTarget(null);
      await refetch();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Gagal menyimpan target." });
    } finally {
      setSavingTarget(false);
    }
  }

  async function removeTarget(t: TargetDTO) {
    if (!window.confirm(`Hapus target "${t.name}"? Setoran yang sudah tercatat (${rupiah(t.currentAmount)}) tidak ikut terhapus.`)) return;
    setDeletingTarget(true);
    try {
      await apiFetch(`/api/targets/${t.id}`, { method: "DELETE" });
      toast({ title: "Target dihapus" });
      await refetch();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Gagal menghapus target." });
    } finally {
      setDeletingTarget(false);
    }
  }

  return (
    <section aria-label="Keuangan pribadi" className="flex flex-col gap-6">
      <SectionHeader
        kicker="buku kas"
        title={monthLabel(month)}
        action={
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" className="size-10" aria-label="Bulan sebelumnya" onClick={() => setMonth(addMonths(month, -1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" className="size-10" aria-label="Bulan berikutnya" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= thisMonth}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button size="sm" className="h-10 ml-1" onClick={() => { setEditTx(null); setFormOpen(true); }}>
              <Plus className="w-4 h-4" aria-hidden="true" />
              Transaksi
            </Button>
          </div>
        }
      />

      {error && (
        <Panel className="border-destructive/40">
          <p className="text-[0.86rem] text-destructive">{error}</p>
        </Panel>
      )}

      {/* Ringkasan: pemasukan, pengeluaran, saldo bulan + saldo total */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 order-6">
        {[
          { icon: TrendingUp, label: "pemasukan", value: data?.summary.income, cls: "text-rt-good", sub: undefined as string | undefined },
          { icon: TrendingDown, label: "pengeluaran", value: data?.summary.expense, cls: "text-destructive", sub: undefined },
          { icon: Scale, label: "saldo bulan ini", value: data?.summary.balance, cls: "text-rt-lilac", sub: undefined },
          {
            icon: Wallet, label: "saldo total", value: data?.allTime.balance,
            cls: (data?.allTime.balance ?? 0) < 0 ? "text-destructive" : "text-foreground",
            sub: data ? `${data.allTime.txCount} transaksi sepanjang waktu` : undefined,
          },
        ].map(({ icon: Icon, label, value, cls, sub }) => (
          <Panel key={label} className="px-3 py-3 sm:p-4">
            <Icon className={cn("w-3.5 h-3.5 mb-1.5", cls)} aria-hidden="true" />
            <p className="rt-kicker text-[0.55rem]">{label}</p>
            <p className={cn("font-[family-name:var(--font-plex-mono)] font-semibold text-[0.95rem] sm:text-lg leading-tight mt-0.5", cls)}>
              {value === undefined ? "…" : rupiah(value)}
            </p>
            {sub && <p className="rt-fine mt-1">{sub}</p>}
          </Panel>
        ))}
      </div>

      {/* Grafik arus kas harian + donut "ke mana uang pergi" */}
      {data && data.summary.txCount > 0 && (
        <div className="grid lg:grid-cols-[1.45fr_1fr] gap-2 sm:gap-3 order-6">
          <CashflowChart daily={data.summary.daily} month={month} />
          <SpendingDonut byCategory={data.summary.byCategory} totalExpense={data.summary.expense} />
        </div>
      )}

      {/* Filter & cari */}
      <Panel className="py-3 order-7">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari catatan / kategori…"
              aria-label="Cari transaksi"
              className="pl-9 h-10"
            />
          </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-1.5" role="group" aria-label="Saring jenis transaksi">
            {(["all", "income", "expense"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={typeFilter === t}
                onClick={() => setTypeFilter(t)}
                className={cn(
                  "min-h-10 flex-1 sm:flex-none rounded-lg border px-3.5 text-[0.78rem] font-medium transition-colors",
                  typeFilter === t
                    ? "border-rt-violet/50 bg-rt-violet/15 text-foreground"
                    : "border-border text-muted-foreground active:bg-white/[0.04]"
                )}
              >
                {t === "all" ? "Semua" : TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-expanded={showCatManager}
            onClick={() => setShowCatManager((v) => !v)}
            className="min-h-9 px-2 text-[0.72rem] font-medium text-muted-foreground hover:text-foreground"
          >
            kelola kategori
          </button>
          </div>
        </div>
      </Panel>

      {showCatManager && (
        <CategoryManager categories={data?.categories ?? []} onSaved={refetch} />
      )}

      {/* Daftar transaksi — kartu responsif, nominal menonjol, masuk/keluar berlabel */}
      <div className="order-8">
        <p className="rt-fine">Transaksi, nominal, dan ringkasan di halaman ini hanya milikmu.</p>
        <div className="flex items-center gap-2 mb-3">
          <p className="rt-kicker mt-3">transaksi ({filtered.length})</p>
          <button
            type="button"
            onClick={openRangeDelete}
            className="ml-auto min-h-9 px-2 text-[0.65rem] font-medium text-muted-foreground hover:text-destructive"
          >
            <CalendarRange className="inline-block w-3.5 h-3.5 mr-1" aria-hidden="true" />
            hapus rentang
          </button>
        </div>
        {rangeOpen && (
          <Panel className="mb-3 border-destructive/30">
            <p className="rt-kicker text-destructive">hapus beberapa transaksi</p>
            <p className="rt-fine mt-1">Hanya transaksi di rentang ini yang akan dihapus. Periksa jumlahnya sebelum mengonfirmasi.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
              <div>
                <Label htmlFor="range-from" className="rt-kicker">dari</Label>
                <Input id="range-from" type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="mt-1 h-11" />
              </div>
              <div>
                <Label htmlFor="range-to" className="rt-kicker">sampai</Label>
                <Input id="range-to" type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="mt-1 h-11" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 mt-3">
              <p className="rt-fine">{rangeMatches.length} transaksi akan dihapus</p>
              <div className="flex gap-2">
                <Button variant="ghost" className="h-10" disabled={deletingRange} onClick={() => setRangeOpen(false)}>Batal</Button>
                <Button variant="outline" className="h-10 text-destructive border-destructive/30 hover:text-destructive" disabled={deletingRange || rangeMatches.length === 0 || rangeFrom > rangeTo} onClick={deleteRange}>
                  {deletingRange && <TinySpinner />}
                  Hapus semua
                </Button>
              </div>
            </div>
          </Panel>
        )}
        {loading && filtered.length === 0 ? (
          <Panel className="text-center py-8">
            <TinySpinner className="mx-auto" />
          </Panel>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title={search || typeFilter !== "all" ? "Tidak ada yang cocok dengan filter." : `Belum ada transaksi bulan ${monthLabel(month).toLowerCase()}.`}
            hint={search || typeFilter !== "all" ? undefined : "Mulai dengan mencatat pemasukan atau pengeluaran pertama."}
            action={
              !(search || typeFilter !== "all") && (
                <Button size="sm" className="h-10" onClick={() => { setEditTx(null); setFormOpen(true); }}>
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Tambah transaksi
                </Button>
              )
            }
          />
        ) : (
          <div className="space-y-2.5">
            {filtered.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-border/70 bg-white/[0.02] px-4 py-3.5 flex items-center gap-3"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "w-9 h-9 rounded-lg grid place-items-center shrink-0 border",
                    t.type === "income" ? "border-rt-good/35 bg-rt-good/10 text-rt-good" : "border-destructive/30 bg-destructive/10 text-destructive"
                  )}
                >
                  {t.type === "income" ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.88rem] font-medium truncate">
                    {t.note || t.categoryName}
                    <span className="text-muted-foreground font-normal"> · {t.categoryName}</span>
                  </p>
                  <p className="rt-fine mt-0.5">
                    {tanggalPendek(t.date)} · {TYPE_LABEL[t.type]}
                  </p>
                </div>
                <div className="text-right shrink-0 flex items-center gap-1">
                  <p className={cn("font-[family-name:var(--font-plex-mono)] font-semibold text-[0.9rem]", t.type === "income" ? "text-rt-good" : "text-destructive")}>
                    {t.type === "income" ? "+" : "−"}{rupiah(t.amount)}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setEditTx(t); setFormOpen(true); }}
                    aria-label={`Sunting transaksi ${t.note || t.categoryName}`}
                    className="w-9 h-10 grid place-items-center rounded-lg text-muted-foreground active:bg-white/[0.05]"
                  >
                    <span className="rt-kicker text-[0.55rem]">ubah</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Alokasi pemasukan — SISTEM TERPISAH dari lensa 50/30/20 */}
      {data && (data.allocation.income > 0 || showAllocTools) && (
        <Panel className="order-3">
          <div className="flex items-center gap-2 mb-1">
            <PlusCircle className="w-4 h-4 text-rt-teal" aria-hidden="true" />
            <p className="rt-kicker">alokasi otomatis pemasukan</p>
            <button
              type="button"
              onClick={() => setShowAllocTools((v) => !v)}
              aria-expanded={showAllocTools}
              className="rt-kicker text-[0.55rem] text-rt-lilac ml-auto min-h-9 px-2"
            >
              {showAllocTools ? "tutup" : "atur"}
            </button>
          </div>
          <p className="rt-fine mb-4">
            Setiap pemasukan dibagi menurut rencana kalian — sistem ini berbeda dari lensa
            pengeluaran 50/30/20 di bawah.
            {data.allocation.income === 0 && " Belum ada pemasukan bulan ini — rencana tetap bisa diatur sekarang."}
          </p>
          <div className="space-y-2">
            {data.allocation.items.map((it) => (
              <div key={it.key} className="flex items-center gap-3">
                <span className="w-24 sm:w-28 text-[0.8rem] text-muted-foreground shrink-0 truncate" title={it.label}>{it.label}</span>
                <div className="flex-1 h-2 rounded-full bg-white/[0.05] overflow-hidden" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-rt-violet to-rt-teal"
                    style={{ width: `${it.percent}%` }}
                  />
                </div>
                <span className="font-[family-name:var(--font-plex-mono)] text-[0.75rem] text-rt-lilac w-24 sm:w-32 text-right shrink-0">
                  {rupiah(it.amount)} <span className="text-muted-foreground">· {it.percent}%</span>
                </span>
              </div>
            ))}
          </div>
          {showAllocTools && (
            <AllocationEditor
              items={data.allocation.items.map((it) => ({ label: it.label, percent: it.percent }))}
              onSaved={refetch}
            />
          )}
        </Panel>
      )}

      {/* Lensa 50/30/20 — interpretasi pengeluaran */}
      {data && data.summary.expense > 0 && (
        <Panel className="order-4">
          <p className="rt-kicker mb-1">lensa pengeluaran 50/30/20</p>
          <p className="rt-fine mb-4">
            Panduan membaca komposisi pengeluaran bulan ini — bukan aturan, dan bukan bagian
            dari alokasi pemasukan di atas.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { key: "needs", label: "Kebutuhan", pct: 50 },
              { key: "wants", label: "Keinginan", pct: 30 },
              { key: "savings", label: "Tabungan/Dana", pct: 20 },
              { key: "charity", label: "Sedekah", pct: 0 },
            ].map(({ key, label, pct }) => {
              const amount = data.summary.byBucket[key as keyof typeof data.summary.byBucket] ?? 0;
              const share = data.summary.expense > 0 ? Math.round((amount / data.summary.expense) * 100) : 0;
              return (
                <div key={key} className="rounded-xl border border-border/70 bg-white/[0.02] px-3 py-2.5">
                  <p className="rt-kicker text-[0.55rem]">{label}{pct > 0 ? ` · panduan ${pct}%` : ""}</p>
                  <p className="font-[family-name:var(--font-plex-mono)] text-[0.85rem] font-semibold mt-1">{rupiah(amount)}</p>
                  <p className="rt-fine mt-0.5">{share}% dari pengeluaran</p>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Dana target */}
      <div className="order-5">
        <MonthlyPlanTable
          categories={data?.categories ?? []}
          byCategory={data?.summary.byCategory ?? []}
          month={month}
        />
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-rt-violet" aria-hidden="true" />
          <p className="rt-kicker">dana target</p>
          <button
            type="button"
            onClick={() => setShowTools((v) => !v)}
            aria-expanded={showTools}
            className="rt-kicker text-[0.55rem] text-rt-lilac ml-auto min-h-9 px-2"
          >
            {showTools ? "tutup" : "kelola"}
          </button>
        </div>
        {data && data.targets.length === 0 ? (
          <EmptyState
            icon={Target}
            title="Belum ada dana target."
            hint="Buat target untuk melihat progres akumulasi — misal dana kamera atau dana darurat."
            action={showTools ? <TargetManager onSaved={refetch} /> : undefined}
          />
        ) : (
          <div className="space-y-2.5">
            {(data?.targets ?? []).map((t) => (
              <Panel key={t.id} className="py-3.5">
                {editingTarget === t.id ? (
                  <div className="space-y-2">
                    <Input value={tName} onChange={(e) => setTName(e.target.value)} maxLength={60} aria-label="Nama target" className="h-11" placeholder="Nama target" />
                    <Input
                      value={tAmount}
                      onChange={(e) => setTAmount(e.target.value.replace(/\D/g, ""))}
                      inputMode="numeric"
                      aria-label="Nominal target"
                      className="h-11 font-[family-name:var(--font-plex-mono)]"
                      placeholder="Nominal tujuan"
                    />
                    <p className="rt-fine">Terkumpul {rupiah(t.currentAmount)} — setoran yang sudah masuk tidak berubah.</p>
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" className="h-10" onClick={() => setEditingTarget(null)} disabled={savingTarget}>Batal</Button>
                      <Button className="h-10" onClick={() => saveTargetEdit(t)} disabled={savingTarget || !tName.trim() || !tAmount}>
                        {savingTarget && <TinySpinner />}
                        Simpan
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-[0.9rem] font-semibold">{t.name}</p>
                        <p className="rt-fine mt-0.5">
                          Terkumpul {rupiah(t.currentAmount)} dari {rupiah(t.targetAmount)} · sisa {rupiah(t.remaining)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-[family-name:var(--font-plex-mono)] text-sm font-semibold text-rt-lilac">{t.percent}%</span>
                        {showTools && (
                          <>
                            <Button size="sm" variant="outline" className="h-9" onClick={() => contribute(t)}>
                              Setor
                            </Button>
                            <Button size="sm" variant="ghost" className="h-9" aria-label={`Sunting target ${t.name}`} onClick={() => beginEditTarget(t)}>
                              Ubah
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-9 text-muted-foreground hover:text-destructive"
                              aria-label={`Hapus target ${t.name}`}
                              onClick={() => removeTarget(t)}
                              disabled={deletingTarget}
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="mt-2.5 h-2 rounded-full bg-white/[0.05] overflow-hidden" aria-hidden="true">
                      <div className="h-full rounded-full bg-gradient-to-r from-rt-violet to-rt-teal transition-all" style={{ width: `${t.percent}%` }} />
                    </div>
                  </>
                )}
              </Panel>
            ))}
            {showTools && <TargetManager onSaved={refetch} />}
          </div>
        )}
      </div>

      <TransactionDrawer
        open={formOpen}
        onOpenChange={setFormOpen}
        editTx={editTx}
        categories={data?.categories ?? []}
        onSaved={afterSave}
      />
    </section>
  );
}

/* ── Drawer tambah/sunting transaksi — urutan input sesuai kebutuhan pengguna ── */

function TransactionDrawer({
  open, onOpenChange, editTx, categories, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editTx: TransactionDTO | null;
  categories: CategoryDTO[];
  onSaved: (msg: string) => void;
}) {
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Saat membuka untuk edit, isi dari transaksi terpilih.
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open && editTx) {
      setType(editTx.type);
      setAmount(String(editTx.amount));
      setCategoryId(editTx.categoryId);
      setDate(editTx.date);
      setNote(editTx.note);
    }
    if (open && !editTx) {
      setType("expense"); setAmount(""); setCategoryId(""); setDate(new Date().toISOString().slice(0, 10)); setNote("");
    }
  }

  const cats = categories.filter((c) => c.type === type);

  async function submit() {
    const amountNum = Number(amount.replace(/\D/g, ""));
    setSaving(true);
    setError(null);
    try {
      if (editTx) {
        await apiFetch(`/api/transactions/${editTx.id}`, {
          method: "PATCH",
          body: JSON.stringify({ type, amount: amountNum, categoryId, date, note }),
        });
        onSaved("Transaksi diperbarui");
      } else {
        await apiFetch("/api/transactions", {
          method: "POST",
          body: JSON.stringify({ type, amount: amountNum, categoryId, date, note }),
        });
        onSaved("Transaksi ditambahkan");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaksi belum tersimpan. Coba lagi.");
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[88dvh]">
        <div className="mx-auto w-full max-w-md px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] overflow-y-auto">
          <DrawerHeader className="p-0 pt-1 pb-3 text-left">
            <DrawerTitle className="font-[family-name:var(--font-fraunces)] text-lg">
              {editTx ? "Sunting transaksi" : "Transaksi baru"}
            </DrawerTitle>
            <DrawerDescription>Yang penting tercatat — detail bisa menyusul.</DrawerDescription>
          </DrawerHeader>

          <div className="space-y-4">
            {/* 1. Jenis */}
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Jenis transaksi">
              {(["expense", "income"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={type === t}
                  onClick={() => { setType(t); setCategoryId(""); }}
                  className={cn(
                    "min-h-12 rounded-xl border text-[0.88rem] font-semibold transition-colors",
                    type === t
                      ? t === "income"
                        ? "border-rt-good/50 bg-rt-good/15 text-rt-good"
                        : "border-destructive/50 bg-destructive/15 text-destructive"
                      : "border-border text-muted-foreground active:bg-white/[0.04]"
                  )}
                >
                  {t === "income" ? "Masuk" : "Keluar"}
                </button>
              ))}
            </div>

            {/* 2. Nominal — paling mudah diakses, keyboard angka */}
            <div>
              <Label htmlFor="tx-amount" className="rt-kicker">nominal</Label>
              <Input
                id="tx-amount"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                className="mt-1.5 h-14 text-xl font-[family-name:var(--font-plex-mono)] font-semibold"
                autoFocus
              />
              {amount && <p className="rt-fine mt-1">{rupiah(Number(amount))}</p>}
            </div>

            {/* 3. Kategori — chip besar, ramah sentuh */}
            <div>
              <p className="rt-kicker mb-1.5">kategori</p>
              {cats.length === 0 ? (
                <p className="rt-fine">Belum ada kategori {TYPE_LABEL[type]} — tambahkan lewat “kelola kategori” di daftar transaksi.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pilih kategori">
                  {cats.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={categoryId === c.id}
                      onClick={() => setCategoryId(c.id)}
                      className={cn(
                        "min-h-10 rounded-lg border px-3 text-[0.78rem] font-medium transition-colors",
                        categoryId === c.id
                          ? "border-rt-violet/50 bg-rt-violet/15 text-foreground"
                          : "border-border text-muted-foreground active:bg-white/[0.04]"
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 4. Tanggal */}
            <div>
              <Label htmlFor="tx-date" className="rt-kicker">tanggal</Label>
              <Input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1.5 h-11" />
            </div>

            {/* 5. Catatan */}
            <div>
              <Label htmlFor="tx-note" className="rt-kicker">catatan (opsional)</Label>
              <Input id="tx-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="mis. belanja mingguan" className="mt-1.5 h-11" />
            </div>

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

            <Button className="w-full h-12 font-semibold" onClick={submit} disabled={saving || !amount || !categoryId}>
              {saving && <TinySpinner />}
              {editTx ? "Simpan perubahan" : "Simpan transaksi"}
            </Button>
            {editTx && (
              <Button variant="outline" className="w-full h-11 text-destructive hover:text-destructive border-destructive/30" onClick={async () => { await apiFetch(`/api/transactions/${editTx.id}`, { method: "DELETE" }); onSaved("Transaksi dihapus"); }}>
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                Hapus transaksi
              </Button>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/* ── Kelola target ── */

function TargetManager({ onSaved }: { onSaved: () => Promise<void> }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Panel className="border-dashed">
      <p className="rt-kicker mb-3">target baru</p>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Dana kamera" aria-label="Nama target" className="h-11" maxLength={60} />
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
          placeholder="Nominal"
          inputMode="numeric"
          aria-label="Nominal target"
          className="h-11"
        />
        <Button
          className="h-11"
          disabled={saving || !name.trim() || !amount}
          onClick={async () => {
            setSaving(true); setError(null);
            try {
              await apiFetch("/api/targets", { method: "POST", body: JSON.stringify({ name, targetAmount: Number(amount) }) });
              setName(""); setAmount("");
              await onSaved();
              toast({ title: "Target dibuat" });
            } catch (e) {
              setError(e instanceof Error ? e.message : "Gagal membuat target.");
            } finally { setSaving(false); }
          }}
        >
          {saving && <TinySpinner />}
          Buat
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive mt-2">{error}</p>}
    </Panel>
  );
}

/* ── Editor alokasi pemasukan — pos bebas: tambah, hapus, ubah nama & persen ── */

type AllocItem = { label: string; percent: number };

function AllocationEditor({ items: initial, onSaved }: { items: AllocItem[]; onSaved: () => Promise<void> }) {
  const { toast } = useToast();
  const [items, setItems] = useState<AllocItem[]>(initial);
  const [saving, setSaving] = useState(false);
  const total = items.reduce((s, it) => s + (Number(it.percent) || 0), 0);
  const dirty =
    items.length !== initial.length ||
    items.some((it, i) => it.label !== initial[i]?.label || (Number(it.percent) || 0) !== initial[i]?.percent);

  const update = (i: number, patch: Partial<AllocItem>) =>
    setItems((arr) => arr.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/api/allocation", {
        method: "PUT",
        body: JSON.stringify({
          items: items.map((it) => ({ label: it.label.trim(), percent: Number(it.percent) || 0 })),
        }),
      });
      toast({ title: "Alokasi diperbarui" });
      await onSaved();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Gagal menyimpan alokasi." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-border/60">
      <p className="rt-kicker mb-3">atur pos alokasi — bebas tambah atau hapus</p>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={it.label}
              onChange={(e) => update(i, { label: e.target.value.slice(0, 40) })}
              placeholder={`Pos ${i + 1}`}
              aria-label={`Nama pos ${i + 1}`}
              className="h-11 flex-1"
              maxLength={40}
            />
            <Input
              value={String(it.percent ?? "")}
              onChange={(e) => update(i, { percent: Number(e.target.value.replace(/\D/g, "").slice(0, 3)) || 0 })}
              inputMode="numeric"
              aria-label={`Persentase pos ${i + 1}`}
              className="h-11 w-16 text-center font-[family-name:var(--font-plex-mono)]"
            />
            <span className="text-[0.8rem] text-muted-foreground shrink-0">%</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
              aria-label={`Hapus pos ${it.label || i + 1}`}
              disabled={items.length <= 1}
              onClick={() => setItems((arr) => arr.filter((_, j) => j !== i))}
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        className="w-full h-11 mt-2 border-dashed"
        disabled={items.length >= 12}
        onClick={() => setItems((arr) => [...arr, { label: "", percent: 0 }])}
      >
        <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
        Tambah pos
      </Button>
      <div className="flex items-center justify-between mt-3">
        <p className={cn("rt-fine font-[family-name:var(--font-plex-mono)]", total === 100 ? "text-rt-good" : "text-destructive")}>
          total {total}% {total === 100 ? "✓" : "— harus tepat 100%"}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="h-10" disabled={!dirty || saving} onClick={() => setItems(initial)}>
            Batal
          </Button>
          <Button className="h-10" disabled={saving || !dirty || total !== 100 || items.some((it) => !it.label.trim())} onClick={save}>
            {saving && <TinySpinner />}
            Simpan
          </Button>
        </div>
      </div>
      <p className="rt-fine mt-2">
        Perubahan berlaku untuk pembagian pemasukan berikutnya — transaksi yang sudah tercatat tidak diubah.
      </p>
    </div>
  );
}

/* ── Kelola kategori — tambah, ganti nama/kelompok/target bulanan, hapus ── */

const BUCKET_LABEL: Record<string, string> = {
  needs: "Kebutuhan",
  wants: "Keinginan",
  charity: "Sedekah",
  savings: "Tabungan",
  target: "Dana target",
  income: "Pemasukan",
};

/* ── Grafik arus kas harian — SVG ringan tanpa library, mengikuti gaya app ── */

function CashflowChart({
  daily,
  month,
}: {
  daily: { date: string; income: number; expense: number }[];
  month: string;
}) {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const W = 720, H = 200, padL = 8, padR = 8, padT = 10, padB = 20;
  const iw = W - padL - padR, ih = H - padT - padB;

  const max = Math.max(1, ...daily.map((d) => Math.max(d.income, d.expense)));
  const x = (day: number) => padL + ((day - 1) / Math.max(1, days - 1)) * iw;
  const yv = (v: number) => padT + ih - (v / max) * ih;
  const byDay = new Map(daily.map((d) => [Number(d.date.slice(8, 10)), d]));
  const path = (key: "income" | "expense") =>
    daily.length === 0
      ? ""
      : daily.map((d, i) => `${i ? "L" : "M"}${x(Number(d.date.slice(8, 10))).toFixed(1)} ${yv(d[key]).toFixed(1)}`).join(" ");

  // Label sumbu: tanggal 1, tengah, akhir bulan.
  const ticks = [1, Math.ceil(days / 2), days];

  return (
    <Panel className="px-4 py-4">
      <p className="rt-kicker mb-0.5">arus kas harian</p>
      <p className="rt-fine mb-3">Pemasukan dan pengeluaran bulan ini, hari demi hari.</p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Grafik arus kas harian bulan ${month}`}
        preserveAspectRatio="none"
      >
        {/* garis nol */}
        <line x1={padL} y1={padT + ih} x2={W - padR} y2={padT + ih} className="stroke-border" strokeWidth="1" />
        {daily.length > 0 && (
          <>
            <path d={path("income")} fill="none" className="stroke-rt-good" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
            <path d={path("expense")} fill="none" className="stroke-destructive" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
            {daily.map((d) => (
              <g key={d.date}>
                <circle cx={x(Number(d.date.slice(8, 10)))} cy={yv(d.income)} r="2.5" className="fill-background stroke-rt-good" strokeWidth="1.5" vectorEffect="non-scaling-stroke">
                  <title>{`${d.date} · masuk ${rupiah(d.income)}`}</title>
                </circle>
                <circle cx={x(Number(d.date.slice(8, 10)))} cy={yv(d.expense)} r="2.5" className="fill-background stroke-destructive" strokeWidth="1.5" vectorEffect="non-scaling-stroke">
                  <title>{`${d.date} · keluar ${rupiah(d.expense)}`}</title>
                </circle>
              </g>
            ))}
          </>
        )}
        {ticks.map((t) => (
          <text key={t} x={x(t)} y={H - 4} textAnchor={t === 1 ? "start" : t === days ? "end" : "middle"} className="fill-muted-foreground" fontSize="10">
            {t}
          </text>
        ))}
      </svg>
      <div className="flex items-center gap-4 mt-2">
        <span className="rt-fine inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="w-2 h-2 rounded-full bg-rt-good" /> masuk
        </span>
        <span className="rt-fine inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="w-2 h-2 rounded-full bg-destructive" /> keluar
        </span>
        <span className="rt-fine ml-auto">puncak keluar {rupiah(Math.max(0, ...daily.map((d) => d.expense)))}</span>
      </div>
    </Panel>
  );
}

/* ── Donut "ke mana uang pergi" — conic-gradient, tanpa library ── */

const DONUT_COLORS = ["#8b7cff", "#40d7c0", "#b6a9ff", "#67d69a", "#e0b564", "#e08d8d", "#7ca6c9"];

function SpendingDonut({
  byCategory,
  totalExpense,
}: {
  byCategory: MonthSummary["byCategory"];
  totalExpense: number;
}) {
  const rows = byCategory.slice(0, 7);
  const segments = rows.map((r, i) => {
    const share = totalExpense > 0 ? (r.total / totalExpense) * 100 : 0;
    const from = rows.slice(0, i).reduce((s, x) => s + (totalExpense > 0 ? (x.total / totalExpense) * 100 : 0), 0);
    return { ...r, color: DONUT_COLORS[i % DONUT_COLORS.length], from, to: from + share };
  });

  return (
    <Panel className="px-4 py-4">
      <p className="rt-kicker mb-0.5">ke mana uang pergi</p>
      <p className="rt-fine mb-3">Rincian pengeluaran per kategori.</p>
      {rows.length === 0 ? (
        <p className="rt-fine py-8 text-center">Belum ada pengeluaran bulan ini.</p>
      ) : (
        <div className="flex flex-col xs:flex-row items-center gap-4">
          <div
            role="img"
            aria-label="Donut rincian pengeluaran per kategori"
            className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-full shrink-0"
            style={{ background: `conic-gradient(${segments.map((s) => `${s.color} ${s.from}% ${s.to}%`).join(", ")})` }}
          >
            <div className="absolute inset-[22%] rounded-full bg-rt-panel grid place-items-center text-center">
              <div>
                <p className="font-[family-name:var(--font-plex-mono)] text-[0.72rem] font-semibold leading-tight">{rupiah(totalExpense)}</p>
                <p className="rt-kicker text-[0.5rem]">keluar</p>
              </div>
            </div>
          </div>
          <ul className="w-full min-w-0 space-y-1.5">
            {segments.map((s) => (
              <li key={s.categoryId} className="flex items-center gap-2 text-[0.78rem]">
                <span aria-hidden="true" className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                <span className="truncate min-w-0 flex-1">{s.name}</span>
                <span className="font-[family-name:var(--font-plex-mono)] text-muted-foreground shrink-0">
                  {totalExpense > 0 ? Math.round((s.total / totalExpense) * 100) : 0}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

/* ── Tabel rencana bulanan — target vs realisasi kategori yang punya target ── */

function MonthlyPlanTable({
  categories,
  byCategory,
  month,
}: {
  categories: CategoryDTO[];
  byCategory: MonthSummary["byCategory"];
  month: string;
}) {
  const rows = categories
    .filter((c) => c.type === "expense" && c.monthlyTarget > 0)
    .map((c) => {
      const actual = byCategory.find((b) => b.categoryId === c.id)?.total ?? 0;
      const pct = c.monthlyTarget > 0 ? Math.min(999, Math.round((actual / c.monthlyTarget) * 100)) : 0;
      return { ...c, actual, pct };
    })
    .sort((a, b) => b.pct - a.pct);

  if (rows.length === 0) return null;

  return (
    <Panel className="order-4 px-4 py-4">
      <p className="rt-kicker mb-0.5">rencana bulanan</p>
      <p className="rt-fine mb-4">
        Target per kategori untuk {monthLabel(month).toLowerCase()} — atur angkanya di kelola kategori.
      </p>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.id}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[0.82rem] font-medium truncate">{r.name}</p>
              <p className="font-[family-name:var(--font-plex-mono)] text-[0.75rem] shrink-0">
                {rupiah(r.actual)}
                <span className="text-muted-foreground"> / {rupiah(r.monthlyTarget)}</span>
              </p>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.05] overflow-hidden" aria-hidden="true">
              <div
                className={cn("h-full rounded-full transition-all", r.pct > 100 ? "bg-destructive" : "bg-rt-teal")}
                style={{ width: `${Math.min(100, r.pct)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function CategoryManager({
  categories,
  onSaved,
}: {
  categories: CategoryDTO[];
  onSaved: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"expense" | "income">("expense");
  const [newBucket, setNewBucket] = useState<string>("needs");

  // Salinan lokal untuk edit inline; disinkron ulang tiap data server berubah.
  const [draft, setDraft] = useState(() => Object.fromEntries(categories.map((c) => [c.id, c.name])));
  const [draftTarget, setDraftTarget] = useState(() =>
    Object.fromEntries(categories.map((c) => [c.id, c.monthlyTarget ? String(c.monthlyTarget) : ""]))
  );
  const lastCount = categories.length;
  const [seenCount, setSeenCount] = useState(lastCount);
  if (seenCount !== lastCount || categories.some((c) => draft[c.id] === undefined)) {
    setSeenCount(lastCount);
    setDraft(Object.fromEntries(categories.map((c) => [c.id, c.name])));
    setDraftTarget(Object.fromEntries(categories.map((c) => [c.id, c.monthlyTarget ? String(c.monthlyTarget) : ""])));
  }

  async function addCategory() {
    setSaving(true);
    try {
      await apiFetch("/api/categories", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          type: newType,
          bucket: newType === "income" ? undefined : newBucket,
        }),
      });
      toast({ title: "Kategori ditambahkan" });
      setNewName("");
      await onSaved();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Gagal menambah kategori." });
    } finally {
      setSaving(false);
    }
  }

  async function patchCategory(id: string, body: Record<string, unknown>, okMsg: string) {
    try {
      await apiFetch(`/api/categories/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      toast({ title: okMsg });
      await onSaved();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Gagal menyimpan kategori." });
    }
  }

  async function removeCategory(c: CategoryDTO) {
    if (!window.confirm(`Hapus kategori "${c.name}"?`)) return;
    try {
      const res = await apiFetch<{ ok: boolean; error?: string }>(`/api/categories/${c.id}`, { method: "DELETE" });
      toast({ title: res?.error ?? "Kategori dihapus" });
      await onSaved();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Gagal menghapus kategori." });
    }
  }

  const expenses = categories.filter((c) => c.type === "expense");
  const incomes = categories.filter((c) => c.type === "income");

  return (
    <Panel className="order-7">
      <p className="rt-kicker mb-1">kelola kategori</p>
      <p className="rt-fine mb-4">
        Kategori yang masih dipakai transaksi tidak bisa dihapus — dia dinonaktifkan supaya riwayat tetap utuh.
      </p>

      {/* Tambah kategori baru */}
      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nama kategori baru"
          aria-label="Nama kategori baru"
          className="h-11 flex-1"
          maxLength={40}
        />
        <div className="flex gap-1.5" role="group" aria-label="Jenis kategori baru">
          {(["expense", "income"] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={newType === t}
              onClick={() => setNewType(t)}
              className={cn(
                "min-h-11 rounded-lg border px-3.5 text-[0.78rem] font-medium",
                newType === t ? "border-rt-violet/50 bg-rt-violet/15 text-foreground" : "border-border text-muted-foreground"
              )}
            >
              {t === "income" ? "Masuk" : "Keluar"}
            </button>
          ))}
        </div>
        {newType === "expense" && (
          <select
            value={newBucket}
            onChange={(e) => setNewBucket(e.target.value)}
            aria-label="Kelompok kategori baru"
            className="h-11 rounded-lg border border-border bg-transparent px-2.5 text-[0.78rem]"
          >
            {Object.entries(BUCKET_LABEL)
              .filter(([k]) => k !== "income")
              .map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
          </select>
        )}
        <Button className="h-11" disabled={saving || !newName.trim()} onClick={addCategory}>
          {saving && <TinySpinner />}
          <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
          Tambah
        </Button>
      </div>

      {/* Daftar kategori keluar */}
      {[
        { title: "pengeluaran", list: expenses, withBucket: true },
        { title: "pemasukan", list: incomes, withBucket: false },
      ].map(({ title, list, withBucket }) =>
        list.length > 0 ? (
          <div key={title} className="mb-4">
            <p className="rt-kicker text-[0.55rem] mb-2">kategori {title}</p>
            <div className="space-y-1.5">
              {list.map((c) => (
                <div key={c.id} className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <Input
                    value={draft[c.id] ?? c.name}
                    onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.value.slice(0, 40) }))}
                    aria-label={`Nama kategori ${c.name}`}
                    className="h-10 flex-1 min-w-36"
                    maxLength={40}
                  />
                  {withBucket && (
                    <select
                      value={c.bucket}
                      onChange={(e) => patchCategory(c.id, { bucket: e.target.value }, "Kelompok diperbarui")}
                      aria-label={`Kelompok ${c.name}`}
                      className="h-10 rounded-lg border border-border bg-transparent px-2 text-[0.75rem]"
                    >
                      {Object.entries(BUCKET_LABEL)
                        .filter(([k]) => k !== "income")
                        .map(([k, label]) => (
                          <option key={k} value={k}>{label}</option>
                        ))}
                    </select>
                  )}
                  <Input
                    value={draftTarget[c.id] ?? ""}
                    onChange={(e) => setDraftTarget((d) => ({ ...d, [c.id]: e.target.value.replace(/\D/g, "") }))}
                    placeholder="Target/bln"
                    inputMode="numeric"
                    aria-label={`Target bulanan ${c.name} (opsional)`}
                    className="h-10 w-28 font-[family-name:var(--font-plex-mono)]"
                  />
                  <button
                    type="button"
                    aria-label={`Simpan perubahan kategori ${c.name}`}
                    disabled={draft[c.id] === c.name && (draftTarget[c.id] ?? "") === (c.monthlyTarget ? String(c.monthlyTarget) : "")}
                    onClick={() =>
                      patchCategory(
                        c.id,
                        {
                          ...(draft[c.id] !== c.name ? { name: draft[c.id]?.trim() } : {}),
                          ...(draftTarget[c.id] ?? "") !== (c.monthlyTarget ? String(c.monthlyTarget) : "")
                            ? { monthlyTarget: Number(draftTarget[c.id] || 0) }
                            : {},
                        },
                        "Kategori diperbarui"
                      )
                    }
                    className="w-10 h-10 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <span className="rt-kicker text-[0.55rem]">simpan</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Hapus kategori ${c.name}`}
                    onClick={() => removeCategory(c)}
                    className="w-10 h-10 grid place-items-center rounded-lg text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null
      )}
    </Panel>
  );
}
