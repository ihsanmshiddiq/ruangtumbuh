// Service worker Ruang Tumbuh — sengaja sederhana dan aman.
//
// Prinsip keamanan data:
// - TIDAK ADA cache untuk /api/* — semua data privat (transaksi, pesan,
//   refleksi, data workspace) SELALU lewat jaringan. Cache publik service
//   worker tidak pernah menyentuh data pengguna.
// - Hanya aset statis build (/_next/static/*, ikon, manifest, font) yang
//   di-cache, karena URL-nya berisi hash konten → aman di-cache lama.
// - Navigasi (document) memakai network-first agar data selalu segar saat
//   online; saat offline, halaman fallback "offline.html" ditampilkan —
//   bukan cache data privat.

const VERSION = "rt-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const OFFLINE_URL = "/offline.html";

// App shell kecil: fallback offline + aset identitas yang stabil.
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Hapus cache dari versi service worker sebelumnya.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      );
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {
          // tidak penting — sebagian browser tak mendukung
        }
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1) Data privat: JANGAN pernah disentuh cache. Langsung jaringan, apa pun
  //    metodenya (GET/POST/PATCH/…). Kegagalan ditangani UI aplikasi.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    return; // tanpa respondWith → default jaringan murni
  }

  // 2) Navigasi halaman: network-first, fallback offline.html saat luring.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const preload = await event.preloadResponse;
          if (preload) return preload;
          return await fetch(request);
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const offline = await cache.match(OFFLINE_URL);
          return (
            offline ??
            new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
          );
        }
      })()
    );
    return;
  }

  // 3) Aset statis same-origin: cache-first. Aman karena hanya /_next/static/*
  //    (hash konten), ikon, font, dan manifest yang masuk pola ini.
  const isStaticAsset =
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname === "/manifest.webmanifest" ||
      /\.(png|svg|ico|woff2?|css|js)$/.test(url.pathname));

  if (request.method === "GET" && isStaticAsset) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok && response.type === "basic") {
            const cache = await caches.open(ASSET_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          return new Response("", { status: 504, statusText: "Offline" });
        }
      })()
    );
  }
  // Selain pola di atas (mis. cross-origin font Google): biarkan default jaringan.
});
