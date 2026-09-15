// Pengganti `cp -r` pada script build — jalan di Windows, macOS, dan Linux.
// Menyalin aset statis + public ke output standalone Next.js.
// Jalankan otomatis dari: bun run build
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error("[copy-standalone] .next/standalone tidak ditemukan — jalankan `next build` dengan output: \"standalone\" lebih dulu.");
  process.exit(1);
}

cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), { recursive: true });
cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });

console.log("[copy-standalone] aset statis & public tersalin ke .next/standalone ✓");
