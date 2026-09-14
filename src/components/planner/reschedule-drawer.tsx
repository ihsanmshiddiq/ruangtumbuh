"use client";

// Bottom sheet reschedule — alur 3 langkah ringkas: pilih hari → (opsional)
// jam baru → simpan. Hanya kejadian minggu itu yang berubah; preferensi
// berulang TIDAK tersentuh (prinsip Fase 3, bagian 4).
import { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TinySpinner } from "@/components/shared/ui-bits";
import { HARI_SINGKAT, HARI_PENUH, weekDates, addDays, tanggalPendek } from "@/lib/dates";
import type { OccurrenceDTO } from "@/server/planner";

export function RescheduleDrawer({
  occ,
  weekStart,
  open,
  onOpenChange,
  onConfirm,
}: {
  occ: OccurrenceDTO | null;
  weekStart: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (target: { date: string; plannedStartTime: string | null }) => Promise<boolean>;
}) {
  // key={occ?.id} → state form terinisialisasi ulang dari props saat target
  // berganti — tanpa setState di effect (aturan react-hooks).
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85dvh]">
        {open && occ && (
          <RescheduleForm
            key={occ.id}
            occ={occ}
            weekStart={weekStart}
            onOpenChange={onOpenChange}
            onConfirm={onConfirm}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}

function RescheduleForm({
  occ,
  weekStart,
  onOpenChange,
  onConfirm,
}: {
  occ: OccurrenceDTO;
  weekStart: string;
  onOpenChange: (v: boolean) => void;
  onConfirm: (target: { date: string; plannedStartTime: string | null }) => Promise<boolean>;
}) {
  const dates = weekDates(weekStart);
  const [dayIndex, setDayIndex] = useState(() => {
    const idx = dates.findIndex((d) => d === occ.date);
    return idx >= 0 ? idx : 0;
  });
  const [time, setTime] = useState(occ.plannedStartTime ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    const ok = await onConfirm({
      date: dates[dayIndex],
      plannedStartTime: time === "" ? null : time,
    });
    setSaving(false);
    if (ok) onOpenChange(false);
    else setError("Pindah jadwal gagal. Coba lagi.");
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] overflow-y-auto">
      <DrawerHeader className="p-0 pt-1 pb-3 text-left">
        <DrawerTitle className="font-[family-name:var(--font-fraunces)] text-lg">
          Pindahkan {occ.activityName}
        </DrawerTitle>
        <DrawerDescription>
          Hanya kejadian minggu ini yang berubah — preferensi hari biasanya tetap.
        </DrawerDescription>
      </DrawerHeader>

      {/* Langkah 1: pilih hari */}
      <p className="rt-kicker mb-2">ke hari</p>
      <div className="grid grid-cols-7 gap-1.5" role="radiogroup" aria-label="Pilih hari tujuan">
        {dates.map((d, i) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={dayIndex === i}
            onClick={() => setDayIndex(i)}
            className={
              "rounded-lg border py-2.5 text-center transition-colors " +
              (dayIndex === i
                ? "border-rt-violet/50 bg-rt-violet/15 text-foreground"
                : "border-border text-muted-foreground active:bg-white/[0.04]")
            }
          >
            <span className="block text-[0.62rem]">{HARI_SINGKAT[i]}</span>
            <span className="block font-[family-name:var(--font-plex-mono)] text-[0.8rem] mt-0.5">
              {tanggalPendek(d).split(" ")[0]}
            </span>
          </button>
        ))}
      </div>

      {/* Langkah 2: jam (opsional) */}
      <div className="mt-4">
        <Label htmlFor="reschedule-time" className="rt-kicker">
          jam baru (boleh dikosongkan)
        </Label>
        <Input
          id="reschedule-time"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="mt-1.5 h-11"
        />
        <p className="rt-fine mt-1.5">
          {time === "" ? "Tanpa jam — cukup hari." : `Ditandai ${time}`}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive mt-3">
          {error}
        </p>
      )}

      {/* Langkah 3: simpan */}
      <div className="mt-5 flex gap-2">
        <Button variant="outline" className="flex-1 h-11" onClick={() => onOpenChange(false)} disabled={saving}>
          Batal
        </Button>
        <Button className="flex-[2] h-11 font-semibold" onClick={submit} disabled={saving}>
          {saving && <TinySpinner />}
          Simpan perpindahan
        </Button>
      </div>

      <p className="rt-fine mt-3 text-center">
        {occ.rescheduledFrom
          ? `Sudah pernah dipindah dari ${tanggalPendek(occ.rescheduledFrom)}.`
          : `Rencana asli: ${HARI_PENUH[new Date(occ.date + "T00:00:00").getDay()]}`}
      </p>
    </div>
  );
}
