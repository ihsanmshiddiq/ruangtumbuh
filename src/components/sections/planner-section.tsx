"use client";

// PERENCANA — rencana minggu yang bergerak dengan kenyataan.
// Mobile: pemilih hari horizontal + agenda hari terpilih.
// Desktop: grid 7 kolom. Reschedule = bottom sheet, preferensi tak tersentuh.
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { OccurrenceCard } from "@/components/planner/occurrence-card";
import { RescheduleDrawer } from "@/components/planner/reschedule-drawer";
import { SectionHeader, EmptyState, Panel, TinySpinner } from "@/components/shared/ui-bits";
import { useApi, apiFetch } from "@/lib/client";
import { weekDates, weekStartOf, addDays, tanggalIndo, tanggalPendek, HARI_SINGKAT, DOW_TO_WEEK_INDEX } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { WeekView, OccurrenceDTO } from "@/server/planner";

export function PlannerSection() {
  const { toast } = useToast();
  const [anchor, setAnchor] = useState(() => weekStartOf(toISO(new Date())));
  const { data, error, loading, refetch } = useApi<WeekView>(`/api/planner/week?start=${anchor}`);

  const [selectedDow, setSelectedDow] = useState<number>(() => DOW_TO_WEEK_INDEX[new Date().getDay()]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resched, setResched] = useState<OccurrenceDTO | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const dates = weekDates(data?.weekStart ?? anchor);
  const byDow = useMemo(() => {
    const map: Record<number, OccurrenceDTO[]> = {};
    for (let i = 0; i < 7; i++) map[i] = [];
    for (const o of data?.occurrences ?? []) map[o.dow]?.push(o);
    return map;
  }, [data]);

  const flexActivities = useMemo(
    () => (data?.activities ?? []).filter((a) => a.preferredDays.length === 0),
    [data]
  );

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
      toast({ title: e instanceof Error ? e.message : "Gagal menyimpan." });
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

  const thisWeek = weekStartOf(toISO(new Date()));

  return (
    <section aria-label="Perencana mingguan" className="space-y-6">
      <SectionHeader
        kicker="perencana"
        title={rentangMinggu(dates)}
        action={
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" className="size-10" aria-label="Minggu sebelumnya" onClick={() => setAnchor(addDays(anchor, -7))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-10" onClick={() => setAnchor(thisWeek)} disabled={anchor === thisWeek}>
              Minggu ini
            </Button>
            <Button variant="outline" size="icon" className="size-10" aria-label="Minggu berikutnya" onClick={() => setAnchor(addDays(anchor, 7))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button size="sm" className="h-10 ml-1" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Aktivitas</span>
            </Button>
          </div>
        }
      />

      {error && (
        <Panel className="border-destructive/40">
          <p className="text-[0.86rem] text-destructive">{error}</p>
        </Panel>
      )}

      {/* Pemilih hari — horizontal di mobile, grid di desktop */}
      <div className="grid grid-cols-7 gap-1.5" role="tablist" aria-label="Pilih hari">
        {dates.map((d, i) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={selectedDow === i}
            onClick={() => setSelectedDow(i)}
            className={cn(
              "rounded-lg border py-2.5 text-center transition-colors min-h-11",
              selectedDow === i
                ? "border-rt-violet/50 bg-rt-violet/15 text-foreground"
                : "border-border text-muted-foreground active:bg-white/[0.04]"
            )}
          >
            <span className="block text-[0.62rem]">{HARI_SINGKAT[i]}</span>
            <span className="block font-[family-name:var(--font-plex-mono)] text-[0.8rem] mt-0.5">
              {tanggalPendek(d).split(" ")[0]}
            </span>
            {byDow[i].length > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  "mx-auto mt-1 block h-1 w-1 rounded-full",
                  byDow[i].some((o) => o.status !== "planned") ? "bg-rt-teal" : "bg-muted-foreground/60"
                )}
              />
            )}
          </button>
        ))}
      </div>

      {/* Agenda hari terpilih */}
      <div>
        <p className="rt-kicker mb-3">{tanggalIndo(dates[selectedDow])}</p>
        {byDow[selectedDow].length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Belum ada rencana untuk hari ini."
            hint="Aktivitas dengan hari preferensi hari itu muncul otomatis. Aktivitas fleksibel bisa ditambahkan manual di bawah."
          />
        ) : (
          <div className="space-y-2.5">
            {byDow[selectedDow].map((occ) => (
              <OccurrenceCard
                key={occ.id}
                occ={occ}
                busy={busyId === occ.id}
                onDone={() => setStatus(occ, "done")}
                onSkip={() => setStatus(occ, "skipped")}
                onReschedule={() => setResched(occ)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Aktivitas fleksibel */}
      {flexActivities.length > 0 && (
        <Panel>
          <p className="rt-kicker mb-3">aktivitas fleksibel — tanpa hari tetap</p>
          <div className="flex flex-wrap gap-2">
            {flexActivities.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={async () => {
                  try {
                    await apiFetch("/api/occurrences", {
                      method: "POST",
                      body: JSON.stringify({ activityId: a.id, date: dates[selectedDow] }),
                    });
                    toast({ title: `${a.name} ditambahkan ke ${HARI_SINGKAT[selectedDow]}` });
                    await refetch();
                  } catch (e) {
                    toast({ title: e instanceof Error ? e.message : "Gagal menambahkan." });
                  }
                }}
                className="min-h-10 rounded-lg border border-rt-lilac/30 bg-rt-lilac/10 px-3 text-[0.8rem] font-medium text-rt-lilac active:bg-rt-lilac/20 transition-colors"
              >
                <Plus className="mr-1 inline w-3.5 h-3.5" aria-hidden="true" />
                {a.name}
              </button>
            ))}
          </div>
          <p className="rt-fine mt-2">Ketuk untuk menambahkan ke hari terpilih.</p>
        </Panel>
      )}

      <RescheduleDrawer
        occ={resched}
        weekStart={data?.weekStart ?? anchor}
        open={resched !== null}
        onOpenChange={(v) => !v && setResched(null)}
        onConfirm={handleReschedule}
      />

      <ActivityDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={async () => {
          setAddOpen(false);
          toast({ title: "Aktivitas ditambahkan" });
          await refetch();
        }}
      />
    </section>
  );
}

function ActivityDrawer({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/activities", {
        method: "POST",
        body: JSON.stringify({
          name,
          preferredDays: days,
          preferredStartTime: time === "" ? null : time,
          estimatedDurationMinutes: duration === "" ? null : Number(duration),
        }),
      });
      setName(""); setDays([]); setTime(""); setDuration("");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85dvh]">
        <div className="mx-auto w-full max-w-md px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] overflow-y-auto">
          <DrawerHeader className="p-0 pt-1 pb-3 text-left">
            <DrawerTitle className="font-[family-name:var(--font-fraunces)] text-lg">Aktivitas baru</DrawerTitle>
            <DrawerDescription>
              Preferensi berulang — panduan, bukan aturan kaku.
            </DrawerDescription>
          </DrawerHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="act-name" className="rt-kicker">nama aktivitas</Label>
              <Input id="act-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80}
                placeholder="mis. Coding" className="mt-1.5 h-11" />
            </div>

            <div>
              <p className="rt-kicker mb-1.5">hari biasanya (boleh kosong = fleksibel)</p>
              <div className="grid grid-cols-7 gap-1.5">
                {HARI_SINGKAT.map((h, i) => (
                  <button key={h} type="button"
                    aria-pressed={days.includes(i)}
                    onClick={() => setDays((prev) => prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i])}
                    className={cn(
                      "min-h-10 rounded-lg border text-[0.68rem] font-medium transition-colors",
                      days.includes(i)
                        ? "border-rt-violet/50 bg-rt-violet/15 text-foreground"
                        : "border-border text-muted-foreground active:bg-white/[0.04]"
                    )}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="act-time" className="rt-kicker">sekitar jam</Label>
                <Input id="act-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1.5 h-11" />
              </div>
              <div>
                <Label htmlFor="act-dur" className="rt-kicker">durasi (menit)</Label>
                <Input id="act-dur" type="number" inputMode="numeric" min={5} max={600} step={5}
                  value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="60"
                  className="mt-1.5 h-11" />
              </div>
            </div>

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-11" onClick={() => onOpenChange(false)} disabled={saving}>Batal</Button>
              <Button className="flex-[2] h-11 font-semibold" onClick={submit} disabled={saving || name.trim() === ""}>
                {saving && <TinySpinner />}
                Simpan aktivitas
              </Button>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rentangMinggu(dates: string[]): string {
  if (dates.length < 7) return "Minggu";
  const first = tanggalPendek(dates[0]);
  const last = tanggalPendek(dates[6]);
  return `${first} – ${last}`;
}
