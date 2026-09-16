"use client";

// Helper client untuk API: pesan error server selalu manusiawi (dibuat di
// src/server/api.ts), loading state eksplisit, tanpa dependensi tambahan.
//
// Cache kecil per-URL (pola stale-while-revalidate): pindah tab memakai data
// yang sudah pernah diambil → UI langsung tergambar tanpa spinner, sementara
// data terbaru tetap diambil ulang dari server di belakang. Server tetap
// satu-satunya sumber kebenaran; cache cuma supaya navigasi terasa instan
// (data Supabase kini via jaringan, bukan database lokal).
import { useCallback, useEffect, useState } from "react";

const cache = new Map<string, unknown>();
const inFlightGets = new Map<string, Promise<unknown>>();

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  // Dua komponen yang meminta URL GET sama pada saat bersamaan cukup memakai
  // satu request. Ini terutama mengurangi double-fetch saat berpindah halaman.
  if (method === "GET") {
    const existing = inFlightGets.get(url);
    if (existing) return existing as Promise<T>;
  }
  const request = (async () => {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok) {
      throw new Error(data?.error ?? (res.status === 401 ? "Sesi tidak valid. Masuk lagi, ya." : "Ada gangguan. Coba lagi."));
    }
    return data as T;
  })();
  if (method !== "GET") return request;
  inFlightGets.set(url, request);
  try {
    return await request;
  } finally {
    inFlightGets.delete(url);
  }
}

export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(url !== null);

  const refetch = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!url) return;
      const hasCache = cache.has(url);
      if (opts?.silent && hasCache) {
        // Revalidasi di belakang — jangan kedipkan spinner.
      } else {
        setLoading(true);
      }
      try {
        const result = await apiFetch<T>(url);
        cache.set(url, result);
        setData(result);
        setError(null);
      } catch (e) {
        // Bila gagal tapi cache ada, tetap tampilkan data lama + pesan halus.
        setError(e instanceof Error ? e.message : "Ada gangguan.");
      } finally {
        setLoading(false);
      }
    },
    [url]
  );

  useEffect(() => {
    if (!url) return;
    const cached = cache.get(url) as T | undefined;
    if (cached !== undefined) {
      // Paint instan dari cache, lalu segarkan di belakang.
      setData(cached);
      setLoading(false);
      void refetch({ silent: true });
    } else {
      void refetch();
    }
  }, [refetch, url]);

  return { data, error, loading, refetch, setData };
}
