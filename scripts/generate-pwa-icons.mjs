// Generator ikon PWA Ruang Tumbuh.
// Desain diturunkan dari identitas aplikasi (globals.css / ruang-tumbuh-v3.html):
// latar gelap #0b0d12, pendar violet #8b7cff & teal #40d7c0 yang sangat halus,
// dan motif tunas (Leaf) dengan warna good #67d69a.
// Jalankan sekali (atau saat identitas berubah): `bun scripts/generate-pwa-icons.mjs`
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const publicDir = path.join(process.cwd(), "public");
const iconsDir = path.join(publicDir, "icons");
await mkdir(iconsDir, { recursive: true });

/**
 * Ikon "any": latar rounded-rect (radius 112/512) — tampil utuh di mana pun
 * maskable tidak dibutuhkan. Ikon "maskable": latar full-bleed (OS memotong
 * bentuknya sendiri) dengan glif diskalakan agar aman di dalam zona aman 80%.
 */
function iconSvg({ maskable = false }) {
  const radius = maskable ? 0 : 112;
  const glyphScale = maskable ? 0.8 : 1;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="glowV" cx="22%" cy="12%" r="62%">
      <stop offset="0%" stop-color="#8b7cff" stop-opacity="0.30"/>
      <stop offset="100%" stop-color="#8b7cff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowT" cx="82%" cy="6%" r="52%">
      <stop offset="0%" stop-color="#40d7c0" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#40d7c0" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="${radius}" fill="#0b0d12"/>
  <rect width="512" height="512" rx="${radius}" fill="url(#glowV)"/>
  <rect width="512" height="512" rx="${radius}" fill="url(#glowT)"/>
  <g transform="translate(256 256) scale(${glyphScale}) translate(-256 -256)">
    <path d="M256 280 C 252 210 210 158 138 140 C 132 214 176 268 256 280 Z" fill="#8b7cff"/>
    <path d="M256 280 C 260 210 302 158 374 140 C 380 214 336 268 256 280 Z" fill="#40d7c0"/>
    <path d="M256 280 C 256 320 256 352 256 398" fill="none" stroke="#67d69a" stroke-width="20" stroke-linecap="round"/>
  </g>
</svg>`;
}

const targets = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-maskable-192.png", size: 192, maskable: true },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
  { file: "apple-touch-icon.png", size: 180, maskable: true }, // iOS: full-bleed, ia yang membulatkan
  { file: "favicon-32.png", size: 32, maskable: false },
];

for (const t of targets) {
  const svg = Buffer.from(iconSvg({ maskable: t.maskable }));
  await sharp(svg).resize(t.size, t.size).png().toFile(path.join(iconsDir, t.file));
  console.log(`✓ ${t.file} (${t.size}×${t.size}${t.maskable ? ", maskable" : ""})`);
}
