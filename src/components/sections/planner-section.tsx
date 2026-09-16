"use client";

// PERENCANA — rencana minggu yang bergerak dengan kenyataan.
// Mobile: pemilih hari horizontal + agenda hari terpilih.
// Desktop: grid 7 kolom. Reschedule = bottom sheet, preferensi tak tersentuh.
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ListTodo, Pencil, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { OccurrenceCard } from "@/components/planner/occurrence-card";
import { RescheduleDrawer } from "@/components/planner/reschedule-drawer";
import { UnavailableDrawer } from "@/components/planner/unavailable-drawer";
import { SectionHeader, EmptyState, Panel, TinySpinner } from "@/components/shared/ui-bits";
import { useApi, apiFetch } from "@/lib/client";
import { weekDates, weekStartOf, addDays, tanggalIndo, tanggalPendek, durasiMenit, HARI_SINGKAT, DOW_TO_WEEK_INDEX } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { SessionContext } from "@/lib/types";
import type { ActivityDTO, WeekView, OccurrenceDTO } from "@/server/planner";

export function PlannerSection({ session }: { session: SessionContext }) {
  const { toast } = useToast();
  const [anchor, setAnchor] = useState(() => weekStartOf(toISO(new Date())));
  const { data, error, loading, refetch } = useApi<WeekView>(`/api/planner/week?start=${anchor}`);

  const [selectedDow, setSelectedDow] = useState<number>(() => DOW_TO_WEEK_INDEX[new Date().getDay()]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resched, setResched] = useState<OccurrenceDTO | null>(null);
  const [unavail, setUnavail] = useState<OccurrenceDTO | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editActivity, setEditActivity] = useState<ActivityDTO | null>(null);
  const [durationTarget, setDurationTarget] = useState<OccurrenceDTO | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string>(session.user.id);

  const dates = weekDates(data?.weekStart ?? anchor);
  const byDow = useMemo(() => {
    const map: Record<number, OccurrenceDTO[]> = {};
    for (let i = 0; i < 7; i++) map[i] = [];
    for (const o of data?.occurrences ?? []) {
      if (ownerFilter === "all" || o.userId === ownerFilter) map[o.dow]?.push(o);
    }
    return map;
  }, [data, ownerFilter]);

  const flexActivities = useMemo(
    () => (data?.activities ?? []).filter((a) => a.createdBy === session.user.id && a.preferredDays.length === 0),
    [data, session.user.id]
  );
  const ownActivities = useMemo(
    () => (data?.activities ?? []).filter((activity) => activity.createdBy === session.user.id),
    [data, session.user.id]
  );

  async function archiveActivity(activity: ActivityDTO) {
    if (!window.confirm(`Hapus "${activity.name}" dari rencana berulang? Riwayat yang sudah tercatat tetap aman.`)) return;
    try {
      await apiFetch(`/api/activities/${activity.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: false }),
      });
      toast({ title: `${activity.name} dihapus dari rencana` });
      await refetch();
    } catch (cause) {
      toast({ title: cause instanceof Error ? cause.message : "Gagal menghapus aktivitas." });
    }
  }

  async function setStatus(occ: OccurrenceDTO, status: "done" | "skipped" | "planned") {
    // "Selesai" di Perencana membuka catatan durasi aktual (untuk review);
    // di Today tetap satu-tap agar cepat.
    if (status === "done") {
      setDurationTarget(occ);
      return;
    }
    setBusyId(occ.id);
    try {
      await apiFetch("/api/occurrences", {
        method: "PATCH",
        body: JSON.stringify({ id: occ.id, status }),
      });
      toast({
        title:
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
            <Button size="sm" className="h-10 ml-1" onClick={() => { setEditActivity(null); setAddOpen(true); }}>
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

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Tampilkan rencana milik">
        {[{ id: "all", label: "Semua" }, ...session.workspace.members.map((m) => ({ id: m.id, label: m.id === session.user.id ? "Aku" : m.displayName }))].map((member) => (
          <button key={member.id} type="button" onClick={() => setOwnerFilter(member.id)} aria-pressed={ownerFilter === member.id}
            className={cn("shrink-0 min-h-9 rounded-lg border px-3 text-[0.75rem] font-medium", ownerFilter === member.id ? "border-rt-violet/50 bg-rt-violet/15 text-foreground" : "border-border text-muted-foreground")}>{member.label}</button>
        ))}
      </div>
      <p className="rt-fine">Detail rencana bisa dilihat berdua. Status, pindah jadwal, dan aktivitas hanya dapat diubah oleh pemiliknya.</p>

      <Panel>
        <div className="flex items-center gap-2 mb-3">
          <ListTodo className="w-4 h-4 text-rt-lilac" aria-hidden="true" />
          <p className="rt-kicker">aktivitas berulangku</p>
          <span className="rt-fine ml-auto">{ownActivities.length}</span>
        </div>
        {ownActivities.length === 0 ? (
          <p className="rt-fine">Belum ada aktivitas berulang. Buat satu untuk mengisi rencana secara otomatis.</p>
        ) : (
          <div className="space-y-2">
            {ownActivities.map((activity) => (
              <div key={activity.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-white/[0.02] px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[0.84rem] font-medium truncate">{activity.name}</p>
                  <p className="rt-fine mt-0.5">{activity.preferredDays.length ? activity.preferredDays.map((day) => HARI_SINGKAT[day]).join(", ") : "fleksibel"}{activity.preferredStartTime ? ` · ${activity.preferredStartTime.slice(0, 5)}` : ""}{activity.estimatedDurationMinutes ? ` · ${durasiMenit(activity.estimatedDurationMinutes)}` : ""}</p>
                </div>
                <button type="button" onClick={() => { setEditActivity(activity); setAddOpen(true); }} className="size-10 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04]" aria-label={`Sunting ${activity.name}`}><Pencil className="w-4 h-4" /></button>
                <button type="button" onClick={() => void archiveActivity(activity)} className="size-10 grid place-items-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10" aria-label={`Hapus ${activity.name}`}><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
        <p className="rt-fine mt-3">Hapus menghentikan pembuatan rencana baru; riwayat sebelumnya tidak dihapus.</p>
      </Panel>

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
            title="Hari ini masih kosong."
            hint="Aktivitas yang biasanya ada di hari ini muncul otomatis — dan kalau hari ini memang sengaja kosong, itu juga sah-sah saja."
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
                onUnavailable={() => setUnavail(occ)}
                canManage={occ.userId === session.user.id}
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

      <UnavailableDrawer
        occ={unavail}
        onOpenChange={(v) => !v && setUnavail(null)}
        onSaved={async (msg) => {
          setUnavail(null);
          toast({ title: msg });
          await refetch();
        }}
      />

      <ActivityDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        activity={editActivity}
        onSaved={async () => {
          setAddOpen(false);
          setEditActivity(null);
          toast({ title: editActivity ? "Aktivitas diperbarui" : "Aktivitas ditambahkan" });
          await refetch();
        }}
      />

      <DurationDrawer
        key={durationTarget?.id ?? "duration-empty"}
        occ={durationTarget}
        onOpenChange={(v) => !v && setDurationTarget(null)}
        onSaved={async (msg) => {
          setDurationTarget(null);
          toast({ title: msg });
          await refetch();
        }}
      />
    </section>
  );
}

/* ── Catatan durasi aktual saat menandai selesai ── */

function DurationDrawer({
  occ,
  onOpenChange,
  onSaved,
}: {
  occ: OccurrenceDTO | null;
  onOpenChange: (v: boolean) => void;
  onSaved: (msg: string) => void;
}) {
  const [minutes, setMinutes] = useState<string>("");
  const [resultNote, setResultNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planned = occ?.plannedDurationMinutes ?? null;
  const chips = [
    ...(planned ? [{ label: durasiMenit(planned) ?? "", value: planned }] : []),
    { label: "15 mnt", value: 15 },
    { label: "30 mnt", value: 30 },
    { label: "1 jam", value: 60 },
    { label: "1,5 jam", value: 90 },
    { label: "2 jam", value: 120 },
  ].filter((c, i, arr) => arr.findIndex((x) => x.value === c.value) === i);

  async function submit(withDuration: boolean) {
    if (!occ) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { id: occ.id, status: "done" };
      if (withDuration && minutes) body.actualDurationMinutes = Number(minutes.replace(/\D/g, ""));
      if (resultNote.trim()) body.note = resultNote.trim();
      await apiFetch("/api/occurrences", { method: "PATCH", body: JSON.stringify(body) });
      onSaved(
        resultNote.trim()
          ? `Selesai: ${occ.activityName} — ${resultNote.trim()}`
          : withDuration && minutes
            ? `Selesai: ${occ.activityName} (${durasiMenit(Number(minutes))})`
            : `Ditandai selesai: ${occ.activityName}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
      setSaving(false);
    }
  }

  return (
    <Drawer open={occ !== null} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[70dvh]">
        {occ && (
          <div className="mx-auto w-full max-w-md px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] overflow-y-auto">
            <DrawerHeader className="p-0 pt-1 pb-3 text-left">
              <DrawerTitle className="font-[family-name:var(--font-fraunces)] text-lg">
                Selesai: {occ.activityName}
              </DrawerTitle>
              <DrawerDescription>
                Berapa lama benar-benar dikerjakan? Boleh dilewati — cuma bahan review mingguan.
              </DrawerDescription>
            </DrawerHeader>

            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setMinutes(String(c.value))}
                  aria-pressed={minutes === String(c.value)}
                  className={cn(
                    "min-h-10 rounded-lg border px-3 text-[0.8rem] font-medium transition-colors",
                    minutes === String(c.value)
                      ? "border-rt-violet/50 bg-rt-violet/15 text-foreground"
                      : "border-border text-muted-foreground active:bg-white/[0.04]"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className="mt-3">
              <Label htmlFor="actual-minutes" className="rt-kicker">atau tulis menitnya</Label>
              <Input
                id="actual-minutes"
                type="number"
                inputMode="numeric"
                min={0}
                max={1440}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))}
                placeholder="mis. 45"
                className="mt-1.5 h-11"
              />
            </div>

            <div className="mt-3">
              <Label htmlFor="result-note" className="rt-kicker">hasil yang dikerjakan (opsional)</Label>
              <Textarea
                id="result-note"
                value={resultNote}
                onChange={(event) => setResultNote(event.target.value.slice(0, 300))}
                maxLength={300}
                placeholder="mis. 20 reps squat, baca 20 halaman, atau poin yang selesai"
                className="mt-1.5 min-h-20 resize-none"
              />
              <p className="rt-fine mt-1">Catatan ini tampil di agenda dan jadi bahan evaluasi mingguan.</p>
            </div>

            {error && <p role="alert" className="text-sm text-destructive mt-3">{error}</p>}

            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1 h-11" onClick={() => submit(false)} disabled={saving}>
                Selesai tanpa menit
              </Button>
              <Button className="flex-[2] h-11 font-semibold" onClick={() => submit(true)} disabled={saving || (!minutes && !resultNote.trim())}>
                {saving && <TinySpinner />}
                Simpan hasil
              </Button>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}

function ActivityDrawer({
  open,
  onOpenChange,
  activity,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  activity: ActivityDTO | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(activity?.name ?? "");
    setDays(activity?.preferredDays ?? []);
    setTime(activity?.preferredStartTime?.slice(0, 5) ?? "");
    setDuration(activity?.estimatedDurationMinutes ? String(activity.estimatedDurationMinutes) : "");
    setError(null);
  }, [activity, open]);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(activity ? `/api/activities/${activity.id}` : "/api/activities", {
        method: activity ? "PATCH" : "POST",
        body: JSON.stringify({
          name,
          preferredDays: days,
          preferredStartTime: time === "" ? null : time,
          estimatedDurationMinutes: duration === "" ? null : Number(duration),
        }),
      });
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
            <DrawerTitle className="font-[family-name:var(--font-fraunces)] text-lg">{activity ? "Sunting aktivitas" : "Aktivitas baru"}</DrawerTitle>
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
                {activity ? "Simpan perubahan" : "Simpan aktivitas"}
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
