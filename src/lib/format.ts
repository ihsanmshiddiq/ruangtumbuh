// Helper format kecil bersama.

/** Format integer rupiah: 1250000 → "Rp1.250.000" (tanpa desimal). */
export function rupiah(n: number | null | undefined): string {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 0;
  const sign = v < 0 ? "-" : "";
  return `${sign}Rp${Math.abs(v).toLocaleString("id-ID")}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function tanggalIndo(date: Date): string {
  return `${HARI[date.getDay()]}, ${date.getDate()} ${BULAN[date.getMonth()]} ${date.getFullYear()}`;
}

export function tanggalPendek(date: Date): string {
  return `${date.getDate()} ${BULAN[date.getMonth()].slice(0, 3)} ${date.getFullYear()}`;
}
