"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type PresenceMember = { id: string; name: string; lastActiveAt: string | null };
const ACTIVE_MS = 90_000;

export function usePresence() {
  const [members, setMembers] = useState<PresenceMember[]>([]);

  const heartbeat = useCallback(async () => {
    if (document.hidden) return;
    try {
      const response = await fetch("/api/presence", { method: "POST" });
      const payload = (await response.json()) as { members?: PresenceMember[] };
      if (Array.isArray(payload.members)) setMembers(payload.members);
    } catch {
      // Presence adalah pelengkap; tidak perlu menampilkan error pada aplikasi.
    }
  }, []);

  useEffect(() => {
    // Jalankan setelah paint awal agar heartbeat tidak memaksa render sinkron
    // saat AppShell sedang dipasang.
    const initial = window.setTimeout(() => void heartbeat(), 0);
    const timer = window.setInterval(() => void heartbeat(), 45_000);
    const onVisibility = () => { if (!document.hidden) void heartbeat(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [heartbeat]);

  // Agar titik berubah menjadi "terakhir aktif" tepat waktu walau belum ada
  // heartbeat baru, evaluasi ulang setiap 15 detik.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  return useMemo(() => members.map((member) => ({
    ...member,
    active: member.lastActiveAt !== null && now - new Date(member.lastActiveAt).getTime() < ACTIVE_MS,
  })), [members, now]);
}
