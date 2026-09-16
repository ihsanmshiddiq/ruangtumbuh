"use client";

// Dukungan PWA sisi client:
// 1. ServiceWorkerRegistrar — mendaftarkan /sw.js (cache aset statis saja,
//    tanpa data privat) dan memberi tahu saat versi baru siap.
// 2. OfflineBanner — status koneksi jujur; tidak pernah berpura-pura tersinkron.
// 3. InstallPromptCard — cara halus memasang aplikasi; tidak interupsi.

import { useEffect, useState } from "react";
import { CloudOff, Download, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "rt_pwa_install_dismissed";
const DISMISS_MS = 1000 * 60 * 60 * 24 * 14; // tanya lagi setelah 14 hari

/* ── 1. Registrasi service worker ───────────────────────────────────────── */

export function ServiceWorkerRegistrar() {
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
      // SW hanya aktif di https / localhost — hindari error di preview http.
      return;
    }
    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              toast({
                title: "Versi baru Ruang Tumbuh siap.",
                description: "Tutup lalu buka lagi aplikasi untuk memakai versi terbaru.",
              });
            }
          });
        });
      } catch {
        // Gagal mendaftar tidak boleh mengganggu aplikasi.
      }
    };
    register();
  }, [toast]);

  return null;
}

/* ── 2. Banner status offline yang jujur ────────────────────────────────── */

export function OfflineBanner({ className }: { className?: string }) {
  const [online, setOnline] = useState(true);
  const [synced, setSynced] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online && synced) return null;

  return (
    <div
      role="status"
      className={cn(
        "flex items-start justify-between gap-3 rounded-xl border border-rt-teal/20 bg-rt-teal/[0.06] px-4 py-3",
        className
      )}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <CloudOff className="w-4 h-4 mt-0.5 shrink-0 text-rt-teal/80" aria-hidden="true" />
        <p className="text-[0.82rem] leading-relaxed text-[#c9cfd9]">
          {online
            ? "Koneksi kembali — perubahan berikutnya tersimpan ke server lagi."
            : "Sedang luring. Kamu masih bisa melihat halaman ini, tetapi perubahan belum bisa tersimpan ke server."}
        </p>
      </div>
      {!online && (
        <button
          type="button"
          onClick={() => setSynced(true)}
          aria-label="Tutup pemberitahuan luring"
          className="p-1.5 -m-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/* ── 3. Ajakan memasang yang halus ──────────────────────────────────────── */

export function InstallPromptCard({ className }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const checkStandalone = () =>
      setIsStandalone(
        window.matchMedia("(display-mode: standalone)").matches ||
          // iOS Safari
          (window.navigator as unknown as { standalone?: boolean }).standalone === true
      );
    checkStandalone();

    const onPrompt = (e: Event) => {
      e.preventDefault(); // cegah popup bawaan browser yang mengganggu
      try {
        const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY));
        if (Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_MS) return;
        // Dismiss lama atau rusak tidak boleh menyembunyikan instalasi selamanya.
        window.localStorage.removeItem(DISMISS_KEY);
      } catch {
        // abaikan — tetap tawarkan
      }
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
      try {
        window.localStorage.removeItem(DISMISS_KEY);
      } catch {
        // abaikan
      }
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.matchMedia("(display-mode: standalone)").addEventListener("change", checkStandalone);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.matchMedia("(display-mode: standalone)").removeEventListener("change", checkStandalone);
    };
  }, []);

  if (isStandalone) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // abaikan
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    } else {
      dismiss(); // ditolak → jangan tanya lagi selama 14 hari
    }
    setDeferred(null);
  };

  // iOS Safari / browser tanpa beforeinstallprompt: tanpa kartu otomatis —
  // petunjuk manual ada di Pengaturan, tanpa interupsi.
  if (!visible || !deferred) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-rt-violet/25 bg-rt-violet/[0.07] px-4 py-3",
        className
      )}
    >
      <Smartphone className="w-4 h-4 shrink-0 text-rt-lilac" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[0.82rem] font-medium">Pasang Ruang Tumbuh</p>
        <p className="text-[0.72rem] text-muted-foreground">
          Buka seperti aplikasi — langsung dari layar utama ponsel.
        </p>
      </div>
      <Button size="sm" className="h-8 shrink-0" onClick={install}>
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
        Pasang
      </Button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Tutup ajakan memasang"
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors shrink-0"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
