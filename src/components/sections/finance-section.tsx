"use client";

// BUKU KAS — transaksi berdua dalam satu workspace.
// Prioritas Fase 3: tambah transaksi 1 tangan (jenis → nominal → kategori →
// tanggal → catatan), ringkasan jelas, alokasi ≠ lensa 50/30/20 (dijelaskan).
import { useMemo, useState } from "react";
import { Plus, Search, Wallet, ArrowDownLeft, ArrowUpRight, Target, TrendingUp, TrendingDown, Scale, ChevronLeft, ChevronRight, PlusCircle, Trash2 } from "lucide-react";
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
    plan: { needsPercent: number; wantsPercent: number; charityPercent: number; savingsPercent: number; targetPercent: number };
    income: number;
    items: { key: string; label: string; percent: number; amount: number }[];
  };
  targets: TargetDTO[];
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
  const [showTools, setShowTools] = useState(false);
  const [showAllocTools, setShowAllocTools] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.transactions ?? []).filter((t) => {
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (q && !`${t.note} ${t.categoryName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, search, typeFilter]);

  const thisMonth = monthKey(new Date());

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

  return (
    <section aria-label="Keuangan" className="space-y-6">
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

      {/* Ringkasan: pemasukan, pengeluaran, saldo */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { icon: TrendingUp, label: "pemasukan", value: data?.summary.income, cls: "text-rt-good" },
          { icon: TrendingDown, label: "pengeluaran", value: data?.summary.expense, cls: "text-destructive" },
          { icon: Scale, label: "saldo", value: data?.summary.balance, cls: "text-rt-lilac" },
        ].map(({ icon: Icon, label, value, cls }) => (
          <Panel key={label} className="px-3 py-3 sm:p-4">
            <Icon className={cn("w-3.5 h-3.5 mb-1.5", cls)} aria-hidden="true" />
            <p className="rt-kicker text-[0.55rem]">{label}</p>
            <p className={cn("font-[family-name:var(--font-plex-mono)] font-semibold text-[0.95rem] sm:text-lg leading-tight mt-0.5", cls)}>
              {value === undefined ? "…" : rupiah(value)}
            </p>
          </Panel>
        ))}
      </div>

      {/* Filter & cari */}
      <Panel className="py-3">
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
        </div>
      </Panel>

      {/* Daftar transaksi — kartu responsif, nominal menonjol, masuk/keluar berlabel */}
      <div>
        <p className="rt-kicker mb-3">transaksi ({filtered.length})</p>
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
                    {tanggalPendek(t.date)} · {TYPE_LABEL[t.type]} · {t.createdByName}
                    {t.createdByName !== "—" ? "" : ""}
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
        <Panel>
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
                <span className="w-24 sm:w-28 text-[0.8rem] text-muted-foreground shrink-0">{it.label}</span>
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
          {showAllocTools && <AllocationEditor plan={data.allocation.plan} onSaved={refetch} />}
        </Panel>
      )}

      {/* Lensa 50/30/20 — interpretasi pengeluaran */}
      {data && data.summary.expense > 0 && (
        <Panel>
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
      <div>
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
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-[0.9rem] font-semibold">{t.name}</p>
                    <p className="rt-fine mt-0.5">
                      Terkumpul {rupiah(t.currentAmount)} dari {rupiah(t.targetAmount)} · sisa {rupiah(t.remaining)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-[family-name:var(--font-plex-mono)] text-sm font-semibold text-rt-lilac">{t.percent}%</span>
                    {showTools && (
                      <Button size="sm" variant="outline" className="h-9" onClick={() => contribute(t)}>
                        Setor
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-2.5 h-2 rounded-full bg-white/[0.05] overflow-hidden" aria-hidden="true">
                  <div className="h-full rounded-full bg-gradient-to-r from-rt-violet to-rt-teal transition-all" style={{ width: `${t.percent}%` }} />
                </div>
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
                <p className="rt-fine">Belum ada kategori {TYPE_LABEL[type]}. Tambahkan lewat kelola kategori (segera).</p>
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

/* ── Editor alokasi pemasukan — persentase editable, wajib total 100% ── */

const ALLOC_FIELDS: { key: keyof AllocPlan; label: string }[] = [
  { key: "needsPercent", label: "Kebutuhan" },
  { key: "wantsPercent", label: "Keinginan" },
  { key: "charityPercent", label: "Sedekah" },
  { key: "savingsPercent", label: "Tabungan" },
  { key: "targetPercent", label: "Dana target" },
];

type AllocPlan = {
  needsPercent: number; wantsPercent: number; charityPercent: number;
  savingsPercent: number; targetPercent: number;
};

function AllocationEditor({ plan, onSaved }: { plan: AllocPlan; onSaved: () => Promise<void> }) {
  const { toast } = useToast();
  const [vals, setVals] = useState<AllocPlan>(plan);
  const [saving, setSaving] = useState(false);
  const total = ALLOC_FIELDS.reduce((s, f) => s + (Number(vals[f.key]) || 0), 0);
  const dirty = ALLOC_FIELDS.some((f) => (Number(vals[f.key]) || 0) !== plan[f.key]);

  return (
    <div className="mt-4 pt-4 border-t border-border/60">
      <p className="rt-kicker mb-3">atur pembagian pemasukan</p>
      <div className="space-y-2">
        {ALLOC_FIELDS.map((f) => (
          <div key={f.key} className="flex items-center gap-3">
            <Label htmlFor={`alloc-${f.key}`} className="w-24 sm:w-28 text-[0.8rem] text-muted-foreground shrink-0">
              {f.label}
            </Label>
            <Input
              id={`alloc-${f.key}`}
              value={String(vals[f.key] ?? "")}
              onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value.replace(/\D/g, "").slice(0, 3) }))}
              inputMode="numeric"
              className="h-11 w-20 text-center font-[family-name:var(--font-plex-mono)]"
              aria-label={`Persentase ${f.label}`}
            />
            <span className="text-[0.8rem] text-muted-foreground">%</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3">
        <p className={cn("rt-fine font-[family-name:var(--font-plex-mono)]", total === 100 ? "text-rt-good" : "text-destructive")}>
          total {total}% {total === 100 ? "✓" : "— harus tepat 100%"}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="h-10" disabled={!dirty || saving} onClick={() => setVals(plan)}>
            Batal
          </Button>
          <Button
            className="h-10"
            disabled={saving || !dirty || total !== 100}
            onClick={async () => {
              setSaving(true);
              try {
                await apiFetch("/api/allocation", { method: "PUT", body: JSON.stringify(vals) });
                toast({ title: "Alokasi diperbarui" });
                await onSaved();
              } catch (e) {
                toast({ title: e instanceof Error ? e.message : "Gagal menyimpan alokasi." });
              } finally { setSaving(false); }
            }}
          >
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
