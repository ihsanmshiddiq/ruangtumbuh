"use client";

import { useSyncExternalStore } from "react";
import { CalendarDays, Sunrise, Sparkles } from "lucide-react";
import { tanggalIndo } from "@/lib/format";

const noopSubscribe = () => () => {};
const getServerDate = () => null;
// Stabil selama satu hari penuh (string sama), aman dari render loop.
const getClientDate = () => tanggalIndo(new Date());

export function TodaySection() {
  // Tanggal mengikuti perangkat pengguna (bukan zona waktu server).
  // Server snapshot null → "…" singkat, lalu diganti tanpa peringatan hidrasi.
  const hariIni = useSyncExternalStore(noopSubscribe, getClientDate, getServerDate);

  return (
    <section aria-label="Hari ini" className="space-y-6">
      <div>
        <p className="rt-kicker flex items-center gap-2">
          <Sunrise className="w-3.5 h-3.5 text-rt-teal/80" aria-hidden="true" />
          hari ini
        </p>
        <h2 className="font-[family-name:var(--font-fraunces)] text-[1.35rem] xs:text-2xl sm:text-3xl font-semibold tracking-[-0.02em] mt-2 leading-[1.15]">
          {hariIni ?? <span className="text-muted-foreground">…</span>}
        </h2>
        <p className="font-[family-name:var(--font-fraunces)] italic text-muted-foreground mt-2 text-[0.92rem]">
          Halaman utama setelah masuk — ringkasan hari ini, energi, dan aktivitas yang
          direncanakan.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-white/[0.018] p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-rt-lilac" aria-hidden="true" />
          <p className="rt-kicker">fase 2 · hadir selanjutnya</p>
        </div>
        <div className="space-y-3 text-[0.86rem] text-[#d8dce4]">
          <p className="leading-relaxed">
            Di fase berikutnya, halaman ini akan menampilkan aktivitas yang direncanakan
            untuk hari ini — lengkap dengan jam, estimasi durasi, status
            <span className="font-[family-name:var(--font-plex-mono)] text-[0.72rem] text-rt-lilac"> planned / done / skipped / rescheduled</span>,
            dan catatan singkat. Tidak ada sekadar &ldquo;selesai / belum&rdquo;.
          </p>
          <p className="leading-relaxed">
            Level energi harian (rendah · sedang · tinggi) juga akan dicatat di sini,
            dipakai sebagai konteks untuk memahami pola mingguan — bukan sebagai nilai.
          </p>
        </div>
        <div className="mt-5 pt-4 border-t border-border/60">
          <p className="rt-fine flex items-start gap-2">
            <CalendarDays className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            Fondasi akses &amp; workspace sudah aktif. Setiap orang hanya melihat data
            workspace-nya sendiri — diverifikasi di server, bukan di browser.
          </p>
        </div>
      </div>
    </section>
  );
}
