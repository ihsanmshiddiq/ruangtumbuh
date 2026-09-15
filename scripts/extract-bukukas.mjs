// Ekstrak INITIAL_PACKAGED_STATE dari buku kas.html → file JSON untuk uji import.
// Jalankan: bun scripts/extract-bukukas.mjs
import { readFileSync, writeFileSync } from "node:fs";
const html = readFileSync("upload/buku kas.html", "utf8");
const m = html.match(/const INITIAL_PACKAGED_STATE=(\{.*?\});\s*\n/);
if (!m) { console.error("blok data tidak ketemu"); process.exit(1); }
const data = JSON.parse(m[1]);
writeFileSync("upload/buku-kas-state.json", JSON.stringify(data, null, 2));
console.log("transaksi:", data.transactions.length, "| kategori:", data.categories.length, "| riwayat alokasi:", data.allocationHistory?.length ?? 0, "| targetGoal:", data.targetGoal);
