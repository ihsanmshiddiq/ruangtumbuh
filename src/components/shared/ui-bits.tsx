"use client";

// Blok UI bersama agar semua halaman terasa SATU produk (konsistensi Fase 3):
// header bagian, badge status 4 arah, empty state, spinner kecil.
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function SectionHeader({
  kicker,
  title,
  action,
}: {
  kicker: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <p className="rt-kicker">{kicker}</p>
        <h2 className="font-[family-name:var(--font-fraunces)] text-[1.35rem] xs:text-2xl sm:text-3xl font-semibold tracking-[-0.02em] mt-2 leading-[1.15]">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

const STATUS: Record<string, { label: string; className: string }> = {
  planned: { label: "direncanakan", className: "border-border text-muted-foreground" },
  done: { label: "selesai", className: "border-rt-good/40 bg-rt-good/10 text-rt-good" },
  skipped: { label: "dilewati", className: "border-border bg-white/[0.03] text-muted-foreground line-through decoration-1" },
  rescheduled: { label: "dipindah", className: "border-rt-teal/40 bg-rt-teal/10 text-rt-teal" },
  unavailable: { label: "tak bisa dilakukan", className: "border-rt-violet/40 bg-rt-violet/10 text-rt-lilac" },
};

/** Badge status dengan label teks — bukan komunikasi warna saja (a11y). */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = STATUS[status] ?? STATUS.planned;
  return (
    <span
      className={cn(
        "rt-kicker inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.55rem]",
        s.className,
        className
      )}
    >
      {s.label}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-white/[0.012] px-6 py-12 text-center">
      {/* Ilustrasi garis sederhana — kosong itu wajar, bukan pesan error */}
      <div aria-hidden="true" className="relative mx-auto mb-3 flex h-14 w-28 items-center justify-center">
        <span className="absolute left-0 grid h-14 w-14 place-items-center rounded-full border border-border/80 bg-white/[0.02]">
          <Icon className="w-5 h-5 text-muted-foreground/60" />
        </span>
        <svg viewBox="0 0 56 28" fill="none" className="absolute right-0 h-7 w-14 text-muted-foreground/35">
          <path d="M2 22h30M10 14h22M18 6h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <p className="mt-1 text-[0.9rem] font-medium">{title}</p>
      {hint && <p className="rt-fine mt-1.5 max-w-xs mx-auto leading-relaxed">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function TinySpinner({ className }: { className?: string }) {
  return <Loader2 className={cn("w-3.5 h-3.5 animate-spin", className)} aria-hidden="true" />;
}

/** Panel kartu standar — satu gaya untuk semua halaman. Hover halus, hormati reduced-motion. */
export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "rounded-2xl border border-border bg-white/[0.018] p-4 sm:p-5 transition-[border-color,background-color] duration-200",
      "hover:border-white/[0.16] hover:bg-white/[0.028]",
      className
    )}>
      {children}
    </div>
  );
}
