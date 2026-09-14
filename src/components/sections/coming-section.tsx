"use client";

import type { LucideIcon } from "lucide-react";
import { Sprout } from "lucide-react";

export function ComingSection({
  phase,
  title,
  icon: Icon,
  description,
  points,
  note,
}: {
  phase: string;
  title: string;
  icon: LucideIcon;
  description: string;
  points: string[];
  note: string;
}) {
  return (
    <section aria-label={title} className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="rt-kicker">{phase} · hadir selanjutnya</p>
          <h2 className="font-[family-name:var(--font-fraunces)] text-[1.35rem] xs:text-2xl sm:text-3xl font-semibold tracking-[-0.02em] mt-2 flex items-center gap-3 leading-[1.15]">
            <Icon className="w-6 h-6 text-rt-violet" aria-hidden="true" />
            {title}
          </h2>
          <p className="text-muted-foreground text-[0.9rem] mt-3 max-w-xl leading-relaxed">
            {description}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-white/[0.018] p-5 sm:p-6">
        <p className="rt-kicker mb-4">yang akan muncul di sini</p>
        <ul className="space-y-3">
          {points.map((point) => (
            <li key={point} className="flex items-start gap-3 text-[0.86rem] text-[#d8dce4]">
              <span
                className="mt-[7px] w-1.5 h-1.5 rounded-full bg-gradient-to-r from-rt-violet to-rt-teal shrink-0"
                aria-hidden="true"
              />
              {point}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-rt-teal/16 bg-rt-teal/[0.045] px-4 py-3.5">
        <Sprout className="w-4 h-4 text-rt-teal/80 mt-0.5 shrink-0" aria-hidden="true" />
        <p className="font-[family-name:var(--font-fraunces)] italic text-[#aab1bd] text-[0.84rem] leading-relaxed">
          {note}
        </p>
      </div>
    </section>
  );
}
