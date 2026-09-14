"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  Sunrise,
  CalendarDays,
  Wallet,
  NotebookPen,
  MessagesSquare,
  Settings,
  Leaf,
  LogOut,
} from "lucide-react";
import type { SectionId, SessionContext } from "@/lib/types";
import { TodaySection } from "@/components/sections/today-section";
import { ComingSection } from "@/components/sections/coming-section";
import { SettingsView } from "@/components/settings/settings-view";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const SECTIONS: {
  id: SectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "today", label: "Hari Ini", icon: Sunrise },
  { id: "planner", label: "Perencana", icon: CalendarDays },
  { id: "finance", label: "Keuangan", icon: Wallet },
  { id: "reflection", label: "Refleksi", icon: NotebookPen },
  { id: "chat", label: "Pesan", icon: MessagesSquare },
  { id: "settings", label: "Pengaturan", icon: Settings },
];

const STORAGE_KEY = "rt_active_section";

// Store mini untuk bagian aktif — terbaca dari localStorage tanpa cascading
// render dan tanpa mismatch hidrasi (server snapshot = "today").
let sectionListeners: (() => void)[] = [];
const sectionStore = {
  subscribe(listener: () => void) {
    sectionListeners.push(listener);
    return () => {
      sectionListeners = sectionListeners.filter((l) => l !== listener);
    };
  },
  getSnapshot(): SectionId {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && SECTIONS.some((s) => s.id === saved)) return saved as SectionId;
    } catch {
      // abaikan — mode privat dsb.
    }
    return "today";
  },
  getServerSnapshot(): SectionId {
    return "today";
  },
  set(id: SectionId) {
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // abaikan
    }
    sectionListeners.forEach((l) => l());
  },
};

export function AppShell({ session }: { session: SessionContext }) {
  const active = useSyncExternalStore(
    sectionStore.subscribe,
    sectionStore.getSnapshot,
    sectionStore.getServerSnapshot
  );

  const goTo = useCallback((id: SectionId) => sectionStore.set(id), []);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.reload();
    }
  }

  const user = session.user;
  const roleLabel = session.workspace.role === "owner" ? "pemilik" : "pasangan";
  const isPreview = session.authMode === "bypass";

  return (
    <div className="min-h-screen flex w-full">
      {/* ── Sidebar (desktop) ─────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-[264px] shrink-0 border-r border-border bg-[#0e1016]/80 backdrop-blur-sm sticky top-0 h-screen p-5">
        <div className="flex items-center gap-2 text-rt-teal/80">
          <Leaf className="w-4 h-4" aria-hidden="true" />
          <span className="rt-kicker">ruang privat · dua anggota</span>
        </div>
        <h1 className="font-[family-name:var(--font-fraunces)] text-[1.65rem] font-semibold tracking-[-0.02em] mt-2">
          Ruang Tumbuh
        </h1>
        <p className="font-[family-name:var(--font-fraunces)] italic text-muted-foreground text-[0.85rem] mt-1">
          Jalan boleh berubah. Arah jangan.
        </p>

        <nav aria-label="Navigasi utama" className="mt-8 flex flex-col gap-1">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => goTo(id)}
              aria-current={active === id ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[0.86rem] font-medium transition-all duration-200 text-left",
                active === id
                  ? "bg-gradient-to-r from-rt-violet/20 to-rt-violet/8 border border-rt-violet/30 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                  : "border border-transparent text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"
              )}
            >
              <Icon className="w-[17px] h-[17px]" />
              {label}
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-border">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full bg-gradient-to-br from-rt-violet/35 to-rt-teal/25 border border-white/10 grid place-items-center font-[family-name:var(--font-plex-mono)] text-xs font-semibold text-rt-lilac"
              aria-hidden="true"
            >
              {initials(user.displayName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[0.84rem] font-semibold truncate">{user.displayName}</p>
              <p className="text-[0.68rem] text-muted-foreground">
                {isPreview ? "mode pratinjau" : roleLabel}
              </p>
            </div>
            {isPreview ? (
              <span
                title="Mode pratinjau — login diaktifkan kembali di fase akhir"
                className="rt-kicker text-[0.55rem] border border-rt-violet/30 bg-rt-violet/10 text-rt-lilac rounded-md px-2 py-1.5 shrink-0"
              >
                pratinjau
              </span>
            ) : (
              <button
                onClick={handleLogout}
                title="Keluar"
                aria-label="Keluar"
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ── Area konten ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Header mobile */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-[#0b0d12]/85 backdrop-blur-md">
          <div className="flex items-center gap-2 min-w-0">
            <Leaf className="w-4 h-4 text-rt-teal/80 shrink-0" aria-hidden="true" />
            <span className="font-[family-name:var(--font-fraunces)] font-semibold tracking-[-0.02em] truncate">
              Ruang Tumbuh
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rt-kicker hidden sm:inline">{roleLabel}</span>
            <button
              onClick={() => goTo("settings")}
              aria-label="Buka pengaturan"
              className="w-8 h-8 rounded-full bg-gradient-to-br from-rt-violet/35 to-rt-teal/25 border border-white/10 grid place-items-center font-[family-name:var(--font-plex-mono)] text-[0.6rem] font-semibold text-rt-lilac"
            >
              {initials(user.displayName)}
            </button>
          </div>
        </header>

        <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-28 lg:pb-10">
          {active === "today" && <TodaySection />}
          {active === "planner" && (
            <ComingSection
              phase="Fase 2"
              title="Perencana mingguan"
              icon={CalendarDays}
              description="Rencana minggu yang bergerak dengan kenyataan — bukan daftar tugas yang menghakimi."
              points={[
                "Navigasi minggu: mundur, maju, kembali ke minggu ini",
                "Aktivitas per hari dengan jam & durasi preferensi",
                "Aktivitas fleksibel (tanpa hari tetap) tetap tercatat",
                "Geser aktivitas ke hari lain — riwayat perpindahan dipertahankan",
              ]}
              note="Jadwal cuma panduan, bukan aturan kaku — boleh geser, yang penting tetap dicatat."
            />
          )}
          {active === "finance" && (
            <ComingSection
              phase="Fase 3"
              title="Buku Kas bersama"
              icon={Wallet}
              description="Sistem keuangan utuh dari Buku Kas, kini dipakai berdua dalam satu workspace."
              points={[
                "Transaksi masuk/keluar: cari, saring, sunting",
                "Arus kas bulanan & komposisi pengeluaran",
                "Anggaran bulanan dengan lensa 50/30/20 sebagai panduan",
                "Alokasi otomatis pemasukan 10/20/10/20/40 — terpisah dari lensa",
                "Dana target dengan progres akumulasi",
              ]}
              note="Angka memberi konteks, bukan vonis. Semua transaksi tercatat siapa yang menambahkan."
            />
          )}
          {active === "reflection" && (
            <ComingSection
              phase="Fase 4"
              title="Refleksi mingguan bersama"
              icon={NotebookPen}
              description="Refleksi yang tadinya pribadi, kini jadi percakapan mingguan berdua."
              points={[
                "Lima pertanyaan refleksi untuk setiap orang",
                "Refleksi masing-masing tampil berdampingan per minggu",
                "Komentar: masukan, saran, semangat — bukan media sosial",
              ]}
              note="Sekali menulis pun tetap data. Tidak ada yang dihakimi di ruang ini."
            />
          )}
          {active === "chat" && (
            <ComingSection
              phase="Fase 5"
              title="Pesan pribadi"
              icon={MessagesSquare}
              description="Obrolan ringan khusus berdua — realtime, sederhana, tanpa keributan."
              points={[
                "Kirim & terima pesan secara realtime",
                "Penanda pengirim dan waktu",
                "Tanpa stiker, reaksi, atau grup — cukup dua orang",
              ]}
              note="Ruang bicara seadanya, untuk koordinasi kecil dan hal-hal yang tak butuh spreadsheet."
            />
          )}
          {active === "settings" && <SettingsView session={session} />}
        </main>

        {/* Footer — menempel di bawah saat konten pendek, terdorong alami saat panjang */}
        <footer className="mt-auto px-4 sm:px-6 pb-24 lg:pb-6">
          <div className="max-w-5xl mx-auto border-t border-border pt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="rt-fine">
              {session.workspace.name} · data hanya untuk dua anggota workspace ini.
            </p>
            <p className="rt-fine">Fase 1 — fondasi & akses privat.</p>
          </div>
        </footer>

        {/* ── Navigasi bawah (mobile) ─────────────────────────────────── */}
        <nav
          aria-label="Navigasi bawah"
          className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-[#0b0d12]/92 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
        >
          <div className="grid grid-cols-6">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => goTo(id)}
                aria-current={active === id ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[0.6rem] font-medium transition-colors min-h-[44px]",
                  active === id ? "text-rt-lilac" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-[18px] h-[18px]" />
                {label}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
