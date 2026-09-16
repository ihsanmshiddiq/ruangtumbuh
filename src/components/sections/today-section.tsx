"use client";

// TODAY — halaman utama yang menjawab: "Hari ini saya perlu melakukan apa?"
// Di atas lipungan: tanggal, energi, agenda hari ini. Tanpa dashboard statistik.
import { useMemo, useState, useSyncExternalStore } from "react";
import { Sunrise, Sparkles, CalendarDays, CloudOff, Wallet, StickyNote, MessagesSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { OccurrenceCard } from "@/components/planner/occurrence-card";
import { RescheduleDrawer } from "@/components/planner/reschedule-drawer";
import { UnavailableDrawer } from "@/components/planner/unavailable-drawer";
import { SectionHeader, EmptyState, Panel, TinySpinner } from "@/components/shared/ui-bits";
import { useApi, apiFetch } from "@/lib/client";
import { goToSection } from "@/lib/section-store";
import { tanggalIndo, toISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { WeekView, OccurrenceDTO } from "@/server/planner";
import type { SessionContext } from "@/lib/types";

const noopSubscribe = () => () => {};
const getClientDate = () => tanggalIndo(toISODate(new Date()));
const getServerDate = () => null;

export function TodaySection({ session }: { session: SessionContext }) {
  const { toast } = useToast();
  const today = toISODate(new Date());
  // Tanggal perangkat tanpa mismatch hidrasi (pola Fase 1).
  const hariLabel = useSyncExternalStore(noopSubscribe, getClientDate, getServerDate);

  const { data, error, loading, refetch } = useApi<WeekView>(`/api/planner/week?start=${today}`);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [resched, setResched] = useState<OccurrenceDTO | null>(null);
  const [unavail, setUnavail] = useState<OccurrenceDTO | null>(null);

  const hariIni = useMemo(
    () => (data?.occurrences ?? []).filter((o) => o.date === today),
    [data, today]
  );
  const energyToday = data?.energy.find((e) => e.date === today)?.level ?? null;
  const selesai = hariIni.filter((o) => o.status === "done").length;
  const tersisa = hariIni.filter((o) => o.status === "planned").length;

  async function setStatus(occ: OccurrenceDTO, status: "done" | "skipped" | "planned") {
    setBusyId(occ.id);
    try {
      await apiFetch("/api/occurrences", {
        method: "PATCH",
        body: JSON.stringify({ id: occ.id, status }),
      });
      toast({
        title:
          status === "done" ? `Ditandai selesai: ${occ.activityName}` :
          status === "skipped" ? `${occ.activityName} dilewati — tidak apa-apa.` :
          `${occ.activityName} kembali direncanakan`,
      });
      await refetch();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Gagal menyimpan. Coba lagi." });
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
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Pindah jadwal gagal." });
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
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Gagal menyimpan energi." });
    }
  }

  return (
    <section aria-label="Hari ini" className="space-y-6">
      <SectionHeader
        kicker="hari ini"
        title={hariLabel ?? "…"}
        action={
          <Button variant="outline" size="sm" className="h-9" onClick={() => goToSection("planner")}>
            <CalendarDays className="w-4 h-4" aria-hidden="true" />
            Buka perencana
          </Button>
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
        <div className="flex items-center gap-2 mb-3">
          <Sunrise className="w-4 h-4 text-rt-teal/80" aria-hidden="true" />
          <p className="rt-kicker">ringkasan hari ini</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "agenda", value: hariIni.length },
            { label: "selesai", value: selesai },
            { label: "tersisa", value: tersisa },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-border/70 bg-white/[0.02] px-3 py-2.5">
              <p className="rt-kicker text-[0.55rem]">{item.label}</p>
              <p className="mt-1 font-[family-name:var(--font-plex-mono)] text-lg font-semibold">{loading ? "…" : item.value}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mt-3" aria-label="Aksi cepat">
          {[
            { id: "finance" as const, label: "Catat transaksi", icon: Wallet },
            { id: "planner" as const, label: "Atur rencana", icon: CalendarDays },
            { id: "notes" as const, label: "Tulis catatan", icon: StickyNote },
            { id: "chat" as const, label: "Kirim pesan", icon: MessagesSquare },
          ].map(({ id, label, icon: Icon }) => (
            <Button key={id} variant="outline" size="sm" className="h-9" onClick={() => goToSection(id)}>
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              {label}
            </Button>
          ))}
        </div>
      </Panel>

      {/* Energi — konteks, bukan nilai */}
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
            <button
              key={level}
              type="button"
              onClick={() => setEnergy(level)}
              aria-pressed={energyToday === level}
              className={cn(
                "flex-1 min-h-11 rounded-xl border px-3 py-2 text-[0.8rem] font-medium transition-colors",
                energyToday === level
                  ? "border-rt-violet/50 bg-rt-violet/15 text-foreground"
                  : "border-border text-muted-foreground active:bg-white/[0.04]"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="rt-fine mt-2">
          Sekadar catatan konteks — bukan penilaian. Dipakai untuk membaca pola mingguan.
        </p>
      </Panel>

      {/* Agenda hari ini */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Sunrise className="w-4 h-4 text-rt-teal/80" aria-hidden="true" />
          <p className="rt-kicker">agenda hari ini</p>
          {loading && <TinySpinner />}
        </div>

        {hariIni.length === 0 ? (
          <EmptyState
            icon={Sunrise}
            title={loading ? "Memuat agenda…" : "Belum ada rencana untuk hari ini."}
            hint={
              loading ? undefined :
              "Aktivitas dengan hari preferensi hari ini akan muncul di sini. Bisa juga tambah kejadian lewat perencana."
            }
            action={
              !loading && (
                <Button variant="outline" size="sm" className="h-9" onClick={() => goToSection("planner")}>
                  Lihat perencana minggu ini
                </Button>
              )
            }
          />
        ) : (
          <div className="space-y-2.5">
            {hariIni.map((occ) => (
              <OccurrenceCard
                key={occ.id}
                occ={occ}
                busy={busyId === occ.id}
                onDone={() => setStatus(occ, "done")}
                onSkip={() => setStatus(occ, "skipped")}
                onReschedule={() => setResched(occ)}
                onUnavailable={() => setUnavail(occ)}
                canManage={occ.userId === session.user.id}
              />
            ))}
          </div>
        )}
      </div>

      <RescheduleDrawer
        occ={resched}
        weekStart={data?.weekStart ?? today}
        open={resched !== null}
        onOpenChange={(v) => !v && setResched(null)}
        onConfirm={handleReschedule}
      />

      <UnavailableDrawer
        occ={unavail}
        onOpenChange={(v) => !v && setUnavail(null)}
        onSaved={async (msg) => {
          setUnavail(null);
          toast({ title: msg });
          await refetch();
        }}
      />
    </section>
  );
}
