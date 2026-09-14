// Store bagian aktif — dibaca dari localStorage tanpa cascading render dan
// tanpa mismatch hidrasi (server snapshot = "today"). Dipakai app-shell
// dan halaman yang ingin berpindah bagian (mis. Today → Perencana).
"use client";

import type { SectionId } from "@/lib/types";

const STORAGE_KEY = "rt_active_section";

export const SECTIONS: {
  id: SectionId;
  label: string;
  iconLabel: string;
}[] = [];

let sectionListeners: (() => void)[] = [];

export const sectionStore = {
  subscribe(listener: () => void) {
    sectionListeners.push(listener);
    return () => {
      sectionListeners = sectionListeners.filter((l) => l !== listener);
    };
  },
  getSnapshot(): SectionId {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (
        saved === "today" || saved === "planner" || saved === "finance" ||
        saved === "reflection" || saved === "chat" || saved === "settings"
      ) {
        return saved;
      }
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

/** Navigasi programatik antar-bagian dari mana pun. */
export function goToSection(id: SectionId) {
  sectionStore.set(id);
}
