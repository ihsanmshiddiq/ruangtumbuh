"use client";

// Helper client untuk API: pesan error server selalu manusiawi (dibuat di
// src/server/api.ts), loading state eksplisit, tanpa dependensi tambahan.
import { useCallback, useEffect, useState } from "react";

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) {
    throw new Error(data?.error ?? (res.status === 401 ? "Sesi tidak valid. Masuk lagi, ya." : "Ada gangguan. Coba lagi."));
  }
  return data as T;
}

export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(url !== null);

  const refetch = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      const result = await apiFetch<T>(url);
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ada gangguan.");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, error, loading, refetch, setData };
}
