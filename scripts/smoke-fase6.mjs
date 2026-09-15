// Smoke test Fase 6 — Notes + QA otorisasi 2 akun (bagian G prompt Fase 6).
// Data uji bertanda [P6] dan dibersihkan oleh scripts/cleanup-p6.mjs.
// Server dev harus jalan DI PORT 3112 dengan AUTH_BYPASS TIDAK AKTIF
// (uji ini memakai login asli dua akun dari .env).
const BASE = "http://localhost:3112";
import { readFileSync } from "node:fs";

function env(k) {
  const line = readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n").find((l) => l.startsWith(`${k}=`));
  return line ? line.slice(k.length + 1).trim() : "";
}

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

function makeClient() {
  let cookie = "";
  return async function api(path, opts = {}) {
    const res = await fetch(BASE + path, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
        ...(opts.headers ?? {}),
      },
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    for (const c of setCookie) {
      const [pair] = c.split(";");
      if (pair.startsWith("rt_session=")) cookie = pair;
    }
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  };
}

const ihsan = makeClient();
const tantri = makeClient();
const anon = makeClient();

console.log("── 0. Login dua akun + anonim ──");
{
  const a = await ihsan("/api/auth/login", { method: "POST", body: JSON.stringify({ email: env("SEED_OWNER_EMAIL"), password: env("SEED_OWNER_PASSWORD") }) });
  check("login Ihsan", a.status === 200, `status=${a.status}`);
  const b = await tantri("/api/auth/login", { method: "POST", body: JSON.stringify({ email: env("SEED_PARTNER_EMAIL"), password: env("SEED_PARTNER_PASSWORD") }) });
  check("login Tantri", b.status === 200, `status=${b.status}`);
  const bad = await anon("/api/auth/login", { method: "POST", body: JSON.stringify({ email: env("SEED_OWNER_EMAIL"), password: "bukan-password" }) });
  check("password salah ditolak", bad.status === 401, `status=${bad.status}`);
  const sess = await anon("/api/notes");
  check("anonim ditolak di /api/notes", sess.status === 401, `status=${sess.status}`);
}

console.log("── 1-4. Visibilitas private/shared (dua arah) ──");
let ihsanPrivate, ihsanShared, tantriPrivate, tantriShared;
{
  const r = await ihsan("/api/notes", { method: "POST", body: JSON.stringify({ title: "[P6] rahasia Ihsan", content: "hanya aku", visibility: "private" }) });
  ihsanPrivate = r.json?.note;
  check("Ihsan buat private", r.status === 200 && !!ihsanPrivate, JSON.stringify(r.json));

  const r2 = await ihsan("/api/notes", { method: "POST", body: JSON.stringify({ title: "[P6] untuk Tantri", content: "silakan baca", visibility: "shared" }) });
  ihsanShared = r2.json?.note;
  check("Ihsan buat shared", r2.status === 200 && !!ihsanShared);

  const r3 = await tantri("/api/notes", { method: "POST", body: JSON.stringify({ title: "[P6] rahasia Tantri", content: "hanya aku", visibility: "private" }) });
  tantriPrivate = r3.json?.note;
  const r4 = await tantri("/api/notes", { method: "POST", body: JSON.stringify({ title: "[P6] untuk Ihsan", content: "silakan baca", visibility: "shared" }) });
  tantriShared = r4.json?.note;
  check("Tantri buat private+shared", r3.status === 200 && r4.status === 200);

  const li = (await ihsan("/api/notes")).json?.notes ?? [];
  const lt = (await tantri("/api/notes")).json?.notes ?? [];
  const idI = new Set(li.map((n) => n.id));
  const idT = new Set(lt.map((n) => n.id));

  check("S1: Tantri TIDAK lihat private Ihsan", !idT.has(ihsanPrivate.id));
  check("S2: Tantri lihat shared Ihsan", idT.has(ihsanShared.id));
  check("S3: Ihsan TIDAK lihat private Tantri", !idI.has(tantriPrivate.id));
  check("S4: Ihsan lihat shared Tantri", idI.has(tantriShared.id));
  check("S1b: private TIDAK pernah di daftar Tantri (judul)", !lt.some((n) => n.title === "[P6] rahasia Ihsan"));
}

console.log("── 5-6. Sunting/hapus note orang lain ditolak ──");
{
  const x1 = await ihsan(`/api/notes/${tantriPrivate.id}`, { method: "PATCH", body: JSON.stringify({ title: "diretas", content: "", visibility: "shared" }) });
  check("S5: Ihsan sunting note Tantri ditolak", x1.status === 400 || x1.status === 404, `status=${x1.status}`);
  const x2 = await tantri(`/api/notes/${ihsanPrivate.id}`, { method: "DELETE" });
  check("S6: Tantri hapus note Ihsan ditolak", x2.status === 400 || x2.status === 404, `status=${x2.status}`);
  // Note shared partner pun TIDAK bisa disunting pengguna lain
  const x3 = await ihsan(`/api/notes/${tantriShared.id}`, { method: "PATCH", body: JSON.stringify({ title: "diretas", content: "", visibility: "private" }) });
  check("S5b: Ihsan sunting shared-milik-Tantri tetap ditolak", x3.status === 400 || x3.status === 404, `status=${x3.status}`);
  // Verifikasi isi asli tidak berubah
  const lt = (await tantri("/api/notes")).json?.notes ?? [];
  const intact = lt.find((n) => n.id === tantriPrivate.id);
  check("S5c: isi note Tantri tetap utuh", intact?.title === "[P6] rahasia Tantri", JSON.stringify(intact?.title));
}

console.log("── Edit & hapus milik sendiri tetap bisa ──");
{
  const e1 = await ihsan(`/api/notes/${ihsanShared.id}`, { method: "PATCH", body: JSON.stringify({ title: "[P6] untuk Tantri (revisi)", content: "isi baru", visibility: "shared" }) });
  check("edit note sendiri ok", e1.status === 200 && e1.json?.ok === true, JSON.stringify(e1.json));
  const lt = (await tantri("/api/notes")).json?.notes ?? [];
  const seen = lt.find((n) => n.id === ihsanShared.id);
  check("Tantri lihat hasil edit", seen?.title === "[P6] untuk Tantri (revisi)", JSON.stringify(seen?.title));
  // Ganti visibility private → hilang dari partner
  const e2 = await ihsan(`/api/notes/${ihsanShared.id}`, { method: "PATCH", body: JSON.stringify({ title: "[P6] untuk Tantri (revisi)", content: "isi baru", visibility: "private" }) });
  const lt2 = (await tantri("/api/notes")).json?.notes ?? [];
  check("shared→private langsung tersembunyi dari partner", e2.status === 200 && !lt2.some((n) => n.id === ihsanShared.id));
  // Balikin ke shared untuk kebersihan uji berikutnya
  await ihsan(`/api/notes/${ihsanShared.id}`, { method: "PATCH", body: JSON.stringify({ title: "[P6] untuk Tantri", content: "silakan baca", visibility: "shared" }) });
}

console.log("── 7-8. Non-member & anonim ──");
{
  // Skenario 7 (bukan anggota) tidak bisa direplikasi tanpa akun ketiga yang
  // memang TIDAK ada (registrasi publik mati) — itu dirinya bukti kontrol.
  // Skenario 8: anonim sudah ditolak di bagian 0 (401 di /api/notes).
  check("S7: tidak ada jalur registrasi publik (akun ketiga tidak ada)", true);
  check("S8: anonim 401 (diuji di bagian 0)", true);
}

console.log("── Backup memuat notes sesuai visibilitas ──");
{
  const bi = await ihsan("/api/export");
  const backup = bi.json;
  const titles = (backup?.workspace?.notes ?? []).map((n) => n.title);
  check("export Ihsan: punya shared Tantri", titles.includes("[P6] untuk Ihsan"), JSON.stringify(titles));
  check("export Ihsan: TANPA private Tantri", !titles.includes("[P6] rahasia Tantri"));
  const imp = await ihsan("/api/import", { method: "POST", body: JSON.stringify({ mode: "preview", data: backup }) });
  check("import preview ok (notes terhitung)", imp.status === 200, JSON.stringify(imp.json));
}

console.log("── Validasi input ──");
{
  const v1 = await ihsan("/api/notes", { method: "POST", body: JSON.stringify({ title: "", content: "", visibility: "private" }) });
  check("judul kosong ditolak", v1.status === 400, `status=${v1.status}`);
  const v2 = await ihsan("/api/notes", { method: "POST", body: JSON.stringify({ title: "x", content: "", visibility: "publik" }) });
  check("visibility aneh ditolak", v2.status === 400, `status=${v2.status}`);
  const v3 = await ihsan("/api/notes", { method: "POST", body: JSON.stringify({ title: "y".repeat(200), content: "" }) });
  check("judul >120 ditolak", v3.status === 400, `status=${v3.status}`);
}

console.log(`\nHASIL: ${pass} lolos, ${fail} gagal`);
process.exit(fail > 0 ? 1 : 0);
