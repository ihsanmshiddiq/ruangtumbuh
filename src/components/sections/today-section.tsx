"use client";

// DASHBOARD BERSAMA — ringkasan hari ini dan bulan berjalan per anggota,
// tanpa mencampur kepemilikan data atau tindakan yang hanya boleh dilakukan
// pemilik masing-masing.
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  CalendarDays,
  CheckCircle2,
  CloudOff,
  Landmark,
  MessagesSquare,
  Sparkles,
  StickyNote,
  Sunrise,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { OccurrenceCard } from "@/components/planner/occurrence-card";
import { RescheduleDrawer } from "@/components/planner/reschedule-drawer";
import { UnavailableDrawer } from "@/components/planner/unavailable-drawer";
import { EmptyState, Panel, SectionHeader, StatusBadge, TinySpinner } from "@/components/shared/ui-bits";
import { apiFetch, useApi } from "@/lib/client";
import { goToSection } from "@/lib/section-store";
import { monthLabel, tanggalIndo, toISODate } from "@/lib/dates";
import { rupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashboardPayload } from "@/server/dashboard";
import type { OccurrenceDTO } from "@/server/planner";
import type { SessionContext } from "@/lib/types";

const noopSubscribe = () => () => {};
const getClientDate = () => tanggalIndo(toISODate(new Date()));
const getServerDate = () => null;

export function TodaySection({ session }: { session: SessionContext }) {
  const { toast } = useToast();
  const today = toISODate(new Date());
  const hariLabel = useSyncExternalStore(noopSubscribe, getClientDate, getServerDate);
  const { data, error, loading, refetch } = useApi<DashboardPayload>(`/api/dashboard?date=${today}`);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [resched, setResched] = useState<OccurrenceDTO | null>(null);
  const [unavail, setUnavail] = useState<OccurrenceDTO | null>(null);

  const hariIni = useMemo(
    () => (data?.week.occurrences ?? []).filter((occurrence) => occurrence.date === today),
    [data, today]
  );
  const energyToday = data?.week.energy.find((energy) => energy.date === today)?.level ?? null;
  const completed = hariIni.filter((occurrence) => occurrence.status === "done").length;
  const planned = hariIni.filter((occurrence) => occurrence.status === "planned").length;

  async function setStatus(occurrence: OccurrenceDTO, status: "done" | "skipped" | "planned") {
    setBusyId(occurrence.id);
    try {
      await apiFetch("/api/occurrences", {
        method: "PATCH",
        body: JSON.stringify({ id: occurrence.id, status }),
      });
      toast({
        title:
          status === "done" ? `Ditandai selesai: ${occurrence.activityName}` :
          status === "skipped" ? `${occurrence.activityName} dilewati — tidak apa-apa.` :
          `${occurrence.activityName} kembali direncanakan`,
      });
      await refetch();
    } catch (cause) {
      toast({ title: cause instanceof Error ? cause.message : "Gagal menyimpan. Coba lagi." });
    } finally {
      setBusyId(null);
    }
  }

  async function handleReschedule(target: { date: string; plannedStartTime: string | null }): Promise<boolean> {
    if (!resched) return false;
    try {
      await apiFetch(`/api/occurrences/${resched.id}/reschedule`, {
        method: "POST",
        body: JSON.stringify(target),
      });
      toast({ title: "Jadwal dipindahkan" });
      await refetch();
      return true;
    } catch (cause) {
      toast({ title: cause instanceof Error ? cause.message : "Pindah jadwal gagal." });
      return false;
    }
  }

  async function setEnergy(level: number) {
    try {
      await apiFetch("/api/energy", {
        method: "PUT",
        body: JSON.stringify({ date: today, level }),
      });
      await refetch();
    } catch (cause) {
      toast({ title: cause instanceof Error ? cause.message : "Gagal menyimpan energi." });
    }
  }

  return (
    <section aria-label="Dashboard bersama" className="space-y-6">
      <SectionHeader
        kicker="dashboard bersama"
        title={hariLabel ?? "…"}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-9" onClick={() => goToSection("planner")}>
              <CalendarDays className="w-4 h-4" aria-hidden="true" />
              Perencana
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={() => goToSection("finance")}>
              <Wallet className="w-4 h-4" aria-hidden="true" />
              Keuangan
            </Button>
          </div>
        }
      />

      {error && (
        <Panel className="border-destructive/40">
          <p className="text-[0.86rem] text-destructive flex items-center gap-2">
            <CloudOff className="w-4 h-4" aria-hidden="true" />
            {error}
          </p>
        </Panel>
      )}

      <Panel>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Sunrise className="w-4 h-4 text-rt-teal/80" aria-hidden="true" />
            <p className="rt-kicker">rencana hari ini</p>
          </div>
          <p className="rt-fine">{loading ? "memuat…" : `${hariIni.length} agenda berdua`}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {session.workspace.members.map((member) => {
            const agenda = hariIni.filter((occurrence) => occurrence.userId === member.id);
            const done = agenda.filter((occurrence) => occurrence.status === "done").length;
            const remaining = agenda.filter((occurrence) => occurrence.status === "planned").length;
            const energy = data?.week.energyByUser[member.id]?.find((item) => item.date === today)?.level;
            const progress = agenda.length === 0 ? 0 : Math.round((done / agenda.length) * 100);
            return (
              <div key={member.id} className="rounded-xl border border-border/70 bg-white/[0.02] p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[0.9rem] font-semibold">{member.displayName}</p>
                    <p className="rt-fine mt-0.5">{member.id === session.user.id ? "rencanamu" : "rencana pasangan"}</p>
                  </div>
                  {energy ? <span className="rt-kicker text-[0.55rem] text-rt-lilac">energi {energy}/3</span> : null}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <MiniStat label="agenda" value={agenda.length} loading={loading} />
                  <MiniStat label="selesai" value={done} loading={loading} tone="good" />
                  <MiniStat label="tersisa" value={remaining} loading={loading} />
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mt-3" aria-label={`${done} dari ${agenda.length} agenda selesai`}>
                  <div className="h-full rounded-full bg-gradient-to-r from-rt-teal to-rt-violet" style={{ width: `${progress}%` }} />
                </div>
                {agenda.length === 0 ? (
                  <p className="rt-fine mt-3">Belum ada agenda tetap untuk hari ini.</p>
                ) : (
                  <div className="mt-3 space-y-1.5">
                    {agenda.slice(0, 2).map((occurrence) => (
                      <div key={occurrence.id} className="flex items-center justify-between gap-2 text-[0.78rem]">
                        <span className="truncate">{occurrence.activityName}</span>
                        <StatusBadge status={occurrence.status} className="shrink-0" />
                      </div>
                    ))}
                    {agenda.length > 2 && <p className="rt-fine">+{agenda.length - 2} agenda lain</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border/60">
          <MiniStat label="agenda bersama" value={hariIni.length} loading={loading} />
          <MiniStat label="sudah selesai" value={completed} loading={loading} tone="good" />
          <MiniStat label="masih berjalan" value={planned} loading={loading} />
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-rt-lilac" aria-hidden="true" />
            <div>
              <p className="rt-kicker">keuangan masing-masing</p>
              <p className="rt-fine mt-0.5">{data ? monthLabel(data.month) : "bulan ini"} · tetap tercatat atas nama pemiliknya</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={() => goToSection("finance")}>
            Detail
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3">
          <MoneyStat icon={TrendingUp} label="masuk bersama" value={data?.finance.combined.income} tone="good" />
          <MoneyStat icon={TrendingDown} label="keluar bersama" value={data?.finance.combined.expense} tone="expense" />
          <MoneyStat icon={Wallet} label="saldo bersama" value={data?.finance.combined.balance} tone="balance" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {session.workspace.members.map((member) => {
            const money = data?.finance.byMember[member.id];
            return (
              <div key={member.id} className="rounded-xl border border-border/70 bg-white/[0.02] p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[0.9rem] font-semibold">{member.displayName}</p>
                    <p className="rt-fine mt-0.5">{money?.txCount ?? 0} transaksi bulan ini</p>
                  </div>
                  <p className={cn("font-[family-name:var(--font-plex-mono)] text-sm font-semibold", (money?.balance ?? 0) < 0 ? "text-destructive" : "text-rt-lilac")}>
                    {money ? rupiah(money.balance) : "…"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="rounded-lg border border-border/60 px-2.5 py-2">
                    <p className="rt-kicker text-[0.52rem]">masuk</p>
                    <p className="mt-1 text-[0.78rem] font-[family-name:var(--font-plex-mono)] text-rt-good font-semibold">{money ? rupiah(money.income) : "…"}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 px-2.5 py-2">
                    <p className="rt-kicker text-[0.52rem]">keluar</p>
                    <p className="mt-1 text-[0.78rem] font-[family-name:var(--font-plex-mono)] text-destructive font-semibold">{money ? rupiah(money.expense) : "…"}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-rt-lilac" aria-hidden="true" />
          <p className="rt-kicker">energi hari ini</p>
        </div>
        <div className="flex items-center gap-2" role="group" aria-label="Set level energi hari ini">
          {[
            { level: 1, label: "rendah" },
            { level: 2, label: "sedang" },
            { level: 3, label: "tinggi" },
          ].map(({ level, label }) => (
            <button key={level} type="button" onClick={() => setEnergy(level)} aria-pressed={energyToday === level}
              className={cn("flex-1 min-h-11 rounded-xl border px-3 py-2 text-[0.8rem] font-medium transition-colors", energyToday === level ? "border-rt-violet/50 bg-rt-violet/15 text-foreground" : "border-border text-muted-foreground active:bg-white/[0.04]")}>{label}</button>
          ))}
        </div>
        <p className="rt-fine mt-2">Sekadar konteks untuk membaca pola bersama—bukan penilaian.</p>
      </Panel>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="w-4 h-4 text-rt-teal/80" aria-hidden="true" />
          <p className="rt-kicker">agenda berdua hari ini</p>
          {loading && <TinySpinner />}
        </div>
        {hariIni.length === 0 ? (
          <EmptyState icon={Sunrise} title={loading ? "Memuat agenda…" : "Belum ada rencana untuk hari ini."}
            hint={loading ? undefined : "Tambahkan aktivitas pribadi melalui Perencana. Setelah dibuat, kalian berdua bisa melihat perkembangannya di sini."}
            action={!loading ? <Button variant="outline" size="sm" className="h-9" onClick={() => goToSection("planner")}>Buka perencana</Button> : undefined} />
        ) : (
          <div className="space-y-2.5">
            {hariIni.map((occurrence) => (
              <OccurrenceCard key={occurrence.id} occ={occurrence} busy={busyId === occurrence.id}
                onDone={() => setStatus(occurrence, "done")} onSkip={() => setStatus(occurrence, "skipped")}
                onReschedule={() => setResched(occurrence)} onUnavailable={() => setUnavail(occurrence)} canManage={occurrence.userId === session.user.id} />
            ))}
          </div>
        )}
      </div>

      <Panel className="py-3.5">
        <p className="rt-kicker mb-2">aksi cepat</p>
        <div className="flex flex-wrap gap-2">
          {[
            { id: "finance" as const, label: "Catat transaksi", icon: Wallet },
            { id: "planner" as const, label: "Atur rencana", icon: CalendarDays },
            { id: "notes" as const, label: "Tulis catatan", icon: StickyNote },
            { id: "chat" as const, label: "Kirim pesan", icon: MessagesSquare },
          ].map(({ id, label, icon: Icon }) => (
            <Button key={id} variant="outline" size="sm" className="h-9" onClick={() => goToSection(id)}><Icon className="w-3.5 h-3.5" aria-hidden="true" />{label}</Button>
          ))}
        </div>
      </Panel>

      <RescheduleDrawer occ={resched} weekStart={data?.week.weekStart ?? today} open={resched !== null} onOpenChange={(open) => !open && setResched(null)} onConfirm={handleReschedule} />
      <UnavailableDrawer occ={unavail} onOpenChange={(open) => !open && setUnavail(null)} onSaved={async (message) => { setUnavail(null); toast({ title: message }); await refetch(); }} />
    </section>
  );
}

function MiniStat({ label, value, loading, tone }: { label: string; value: number; loading: boolean; tone?: "good" }) {
  return <div className="rounded-lg border border-border/60 bg-black/[0.08] px-2.5 py-2"><p className="rt-kicker text-[0.5rem]">{label}</p><p className={cn("mt-1 font-[family-name:var(--font-plex-mono)] text-sm font-semibold", tone === "good" && "text-rt-good")}>{loading ? "…" : value}</p></div>;
}

function MoneyStat({ icon: Icon, label, value, tone }: { icon: typeof Wallet; label: string; value: number | undefined; tone: "good" | "expense" | "balance" }) {
  const className = tone === "good" ? "text-rt-good" : tone === "expense" ? "text-destructive" : "text-rt-lilac";
  return <div className="rounded-xl border border-border/70 bg-white/[0.02] px-3 py-3 sm:p-4 min-w-0"><Icon className={cn("w-3.5 h-3.5 mb-1.5", className)} aria-hidden="true" /><p className="rt-kicker text-[0.5rem]">{label}</p><p className={cn("mt-1 text-[0.74rem] sm:text-[0.9rem] leading-tight font-[family-name:var(--font-plex-mono)] font-semibold break-words", className)}>{value === undefined ? "…" : rupiah(value)}</p></div>;
}
