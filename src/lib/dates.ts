// Util tanggal bersama (client & server) — seminggu dimulai hari Senin.
// Semua tanggal dalam format "YYYY-MM-DD" dihitung di zona lokal perangkat,
// tanpa pergeseran UTC. Tanggal perangkat dipakai (sesuai Fase 1).

export const HARI_SINGKAT = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"]; // urutan minggu
export const HARI_PENUH = [
  "Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu",
];
// getDay(): 0=Minggu..6=Sabtu → indeks urutan minggu (Senin=0)
export const DOW_TO_WEEK_INDEX = [6, 0, 1, 2, 3, 4, 5];

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(s: string, n: number): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Senin pada minggu berisi tanggal s. */
export function weekStartOf(s: string): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() - DOW_TO_WEEK_INDEX[d.getDay()]);
  return toISODate(d);
}

/** Tujuh tanggal YYYY-MM-DD berturut sejak Senin. */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** Awal bulan (YYYY-MM-01) dari tanggal. */
export function monthStartOf(s: string): string {
  return `${s.slice(0, 7)}-01`;
}

/** Daftar YYYY-MM (bulan pertama..terakhir, inklusif) untuk pemilih bulan. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${BULAN[(m ?? 1) - 1]} ${y}`;
}

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function tanggalIndo(s: string): string {
  const d = parseISODate(s);
  return `${HARI_PENUH[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

export function tanggalPendek(s: string): string {
  const d = parseISODate(s);
  return `${d.getDate()} ${BULAN[d.getMonth()].slice(0, 3)}`;
}

/** "sekitar 19:15" — waktu sebagai preferensi, bukan aturan kaku. */
export function sekitarJam(time: string | null | undefined): string {
  if (!time) return "";
  return `sekitar ${time.slice(0, 5)}`;
}

/** Menit → "1 jam 15 mnt" / "40 mnt" — pembacaan manusiawi. */
export function durasiMenit(menit: number | null | undefined): string {
  if (!menit || menit <= 0) return "";
  const j = Math.floor(menit / 60);
  const m = menit % 60;
  if (j === 0) return `${m} mnt`;
  if (m === 0) return `${j} jam`;
  return `${j} jam ${m} mnt`;
}

/** Validasi HH:MM (00:00–23:59) untuk input server. */
export function isHHMM(v: unknown): v is string {
  return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

/** Validasi YYYY-MM-DD untuk input server. */
export function isISODate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(parseISODate(v).getTime());
}
