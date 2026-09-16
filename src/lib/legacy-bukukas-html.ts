// Parser backup Buku Kas berbentuk HTML. File dibaca sebagai teks biasa —
// JavaScript di dalamnya TIDAK pernah dijalankan. Hanya paket JSON statis
// INITIAL_PACKAGED_STATE yang diekstrak.

const PACKAGE_MARKER = "const INITIAL_PACKAGED_STATE";
const EXCLUDED_FROM = "2026-09-01";
const EXCLUDED_TO = "2026-09-07";

function extractJsonObject(source: string, marker: string): unknown {
  const markerAt = source.indexOf(marker);
  if (markerAt < 0) throw new Error("Paket data Buku Kas tidak ditemukan di file HTML.");

  const start = source.indexOf("{", markerAt);
  if (start < 0) throw new Error("Paket data Buku Kas tidak lengkap.");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(source.slice(start, i + 1));
    }
  }
  throw new Error("Paket data Buku Kas tidak lengkap.");
}

/**
 * Ambil data statis dari buku kas.html lalu kecualikan data yang pengguna
 * tidak ingin dipulihkan. Riwayat alokasi ikut disaring agar nilai Dana
 * Target tidak menghitung pemasukan yang sengaja dikecualikan.
 */
export function parseBukuKasHtml(source: string): { data: unknown; excludedTransactions: number } {
  const parsed = extractJsonObject(source, PACKAGE_MARKER);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Paket data Buku Kas tidak valid.");
  }
  const raw = parsed as Record<string, unknown>;
  if (!Array.isArray(raw.transactions) || !Array.isArray(raw.categories)) {
    throw new Error("Paket data Buku Kas tidak valid.");
  }

  const excludedIds = new Set<string>();
  const transactions = raw.transactions.filter((transaction) => {
    if (typeof transaction !== "object" || transaction === null) return true;
    const row = transaction as Record<string, unknown>;
    const date = typeof row.date === "string" ? row.date : "";
    const excluded = date >= EXCLUDED_FROM && date <= EXCLUDED_TO;
    if (excluded && typeof row.id === "string") excludedIds.add(row.id);
    return !excluded;
  });
  const allocationHistory = Array.isArray(raw.allocationHistory)
    ? raw.allocationHistory.filter((entry) => {
        if (typeof entry !== "object" || entry === null) return true;
        const row = entry as Record<string, unknown>;
        const date = typeof row.date === "string" ? row.date : "";
        return !excludedIds.has(String(row.incomeTransactionId ?? "")) && !(date >= EXCLUDED_FROM && date <= EXCLUDED_TO);
      })
    : raw.allocationHistory;

  return {
    data: { ...raw, transactions, allocationHistory },
    excludedTransactions: raw.transactions.length - transactions.length,
  };
}
