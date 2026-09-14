"use client";

// Kartu satu kejadian aktivitas — dipakai Today & Planner.
// Aksi cepat: Selesai / Lewati / Pindah. Waktu ditampilkan manusiawi
// ("sekitar 19:15"), status berlabel teks (bukan warna saja).
import { Check, X, CalendarArrowDown } from "lucide-react";
import { StatusBadge } from "@/components/shared/ui-bits";
import { durasiMenit, sekitarJam } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { OccurrenceDTO } from "@/server/planner";

export function OccurrenceCard({
  occ,
  busy,
  onDone,
  onSkip,
  onReschedule,
  compact = false,
}: {
  occ: OccurrenceDTO;
  busy?: boolean;
  onDone: () => void;
  onSkip: () => void;
  onReschedule: () => void;
  compact?: boolean;
}) {
  const waktu = sekitarJam(occ.plannedStartTime);
  const durasi = durasiMenit(occ.plannedDurationMinutes);
  const isDone = occ.status === "done";
  const isSkipped = occ.status === "skipped";

  return (
    <div
      className={cn(
        "rounded-xl border border-border/70 bg-white/[0.02] px-4 py-3.5 transition-opacity",
        isDone && "opacity-70",
        isSkipped && "opacity-55",
        busy && "opacity-50 pointer-events-none"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-[family-name:var(--font-plex-mono)] text-[0.72rem] text-rt-lilac">
              {waktu || "fleksibel"}
            </span>
            <span
              className={cn(
                "text-[0.92rem] font-semibold leading-tight",
                isSkipped && "line-through decoration-1 text-muted-foreground"
              )}
            >
              {occ.activityName}
            </span>
            <StatusBadge status={occ.status} />
          </div>
          {!compact && durasi && (
            <p className="rt-fine mt-1">{durasi}</p>
          )}
          {occ.rescheduledFrom && (
            <p className="rt-fine mt-1 text-rt-teal/70">
              dipindah dari {occ.rescheduledFrom.slice(8)}/{occ.rescheduledFrom.slice(5, 7)}
            </p>
          )}
          {occ.note && <p className="text-[0.78rem] text-muted-foreground mt-1">{occ.note}</p>}
        </div>

        {/* Aksi cepat — target sentuh ≥40px, label teks jelas */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!isDone && (
            <button
              type="button"
              onClick={onDone}
              disabled={busy}
              aria-label={`Tandai ${occ.activityName} selesai`}
              title="Selesai"
              className="h-10 w-10 grid place-items-center rounded-lg border border-rt-good/35 bg-rt-good/10 text-rt-good transition-colors active:bg-rt-good/20"
            >
              <Check className="w-[18px] h-[18px]" aria-hidden="true" />
            </button>
          )}
          {!isSkipped && !isDone && (
            <button
              type="button"
              onClick={onSkip}
              disabled={busy}
              aria-label={`Lewati ${occ.activityName}`}
              title="Lewati"
              className="h-10 w-10 grid place-items-center rounded-lg border border-border text-muted-foreground transition-colors active:bg-white/[0.05]"
            >
              <X className="w-[18px] h-[18px]" aria-hidden="true" />
            </button>
          )}
          {!isDone && (
            <button
              type="button"
              onClick={onReschedule}
              disabled={busy}
              aria-label={`Pindahkan ${occ.activityName}`}
              title="Pindahkan"
              className="h-10 w-10 grid place-items-center rounded-lg border border-rt-teal/35 bg-rt-teal/10 text-rt-teal transition-colors active:bg-rt-teal/20"
            >
              <CalendarArrowDown className="w-[18px] h-[18px]" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
