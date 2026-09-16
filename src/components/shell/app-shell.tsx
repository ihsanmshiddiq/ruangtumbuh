"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  Sunrise,
  CalendarDays,
  Wallet,
  NotebookPen,
  StickyNote,
  MessagesSquare,
  Settings,
  Leaf,
  LogOut,
} from "lucide-react";
import type { SectionId, SessionContext } from "@/lib/types";
import { TodaySection } from "@/components/sections/today-section";
import { SettingsView } from "@/components/settings/settings-view";
import { PlannerSection } from "@/components/sections/planner-section";
import { FinanceSection } from "@/components/sections/finance-section";
import { ReflectionSection } from "@/components/sections/reflection-section";
import { NotesSection } from "@/components/sections/notes-section";
import { ChatSection } from "@/components/sections/chat-section";
import { OfflineBanner, InstallPromptCard } from "@/components/pwa/pwa-client";
import { initials } from "@/lib/format";
import { sectionStore } from "@/lib/section-store";
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
  { id: "notes", label: "Notes", icon: StickyNote },
  { id: "chat", label: "Pesan", icon: MessagesSquare },
  { id: "settings", label: "Pengaturan", icon: Settings },
];

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
    <div className="min-h-dvh flex w-full">
      {/* Lewati ke konten — navigasi keyboard/screen reader di desktop */}
      <a
        href="#konten-utama"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-rt-violet/20 focus:border focus:border-rt-violet/40 focus:px-4 focus:py-2 focus:text-sm"
      >
        Langsung ke konten
      </a>

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
      <div className="flex-1 flex flex-col min-h-dvh min-w-0">
        {/* Header mobile — napas di bawah safe-area atas (notch/status bar) */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 border-b border-border bg-[#0b0d12]/85 backdrop-blur-md">
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

        <main
          id="konten-utama"
          className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 pt-5 sm:pt-8 space-y-6 pb-[calc(4.6rem+env(safe-area-inset-bottom))] lg:pb-10 lg:space-y-0 lg:py-8"
        >
          {active === "today" && <TodaySection session={session} />}
          {active === "planner" && <PlannerSection session={session} />}
          {active === "finance" && <FinanceSection session={session} />}
          {active === "reflection" && <ReflectionSection />}
          {active === "notes" && <NotesSection />}
          {active === "chat" && <ChatSection />}
          {active === "settings" && <SettingsView session={session} />}

          {/* PWA: status koneksi + ajakan memasang yang halus, tanpa interupsi */}
          <OfflineBanner className="lg:hidden" />
          <InstallPromptCard className="lg:hidden" />
        </main>

        {/* Footer — menempel di bawah saat konten pendek, terdorong alami saat panjang */}
        <footer className="mt-auto px-4 sm:px-6 pb-[calc(4.6rem+env(safe-area-inset-bottom))] lg:pb-6">
          <div className="max-w-5xl mx-auto border-t border-border pt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="rt-fine">
              {session.workspace.name} · data hanya untuk dua anggota workspace ini.
            </p>
          </div>
        </footer>

        {/* ── Navigasi bawah (mobile) ─────────────────────────────────── */}
        <nav
          aria-label="Navigasi bawah"
          className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-[#0b0d12]/92 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
        >
          <div className="grid grid-cols-7">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => goTo(id)}
                aria-current={active === id ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-start gap-1 pt-2.5 pb-1.5 h-14 text-[0.6rem] font-medium transition-colors select-none touch-manipulation",
                  active === id ? "text-rt-lilac" : "text-muted-foreground active:text-foreground"
                )}
              >
                <Icon className="w-[19px] h-[19px]" aria-hidden="true" />
                {label}
                {/* Penanda aktif berbentuk titik — bukan hanya warna teks */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "w-1 h-1 rounded-full transition-opacity",
                    active === id ? "bg-rt-lilac opacity-100" : "opacity-0"
                  )}
                />
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
