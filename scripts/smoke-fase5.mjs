// Smoke test Fase 5: status unavailable, export backup penuh, import 2-langkah.
// Data uji bertanda [P5] dan dibersihkan oleh scripts/cleanup-p5.mjs.
// Jalankan: bun scripts/smoke-fase5.mjs (server dev harus sudah jalan di :3112)
const BASE = "http://localhost:3112";
let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`); }
}
async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

console.log("── 1. Unavailable ──");
{
  // Buat aktivitas [P5], buat kejadian hari ini, tandai unavailable dengan catatan.
  const mk = await api("/api/activities", { method: "POST", body: JSON.stringify({ name: "[P5] Setup alat" }) });
  const actId = mk.json?.activity?.id ?? mk.json?.id;
  check("buat aktivitas", mk.status === 200 && !!actId, JSON.stringify(mk.json));
  const today = new Date().toISOString().slice(0, 10);
  const occ = await api("/api/occurrences", { method: "POST", body: JSON.stringify({ activityId: actId, date: today }) });
  check("buat kejadian", occ.status === 200 && occ.json?.id, JSON.stringify(occ.json));

  const bad = await api("/api/occurrences", { method: "PATCH", body: JSON.stringify({ id: occ.json.id, status: "sabotase" }) });
  check("status tak dikenal ditolak", bad.status === 400, `status=${bad.status}`);

  const ok = await api("/api/occurrences", { method: "PATCH", body: JSON.stringify({ id: occ.json.id, status: "unavailable", note: "listrik mati [P5]" }) });
  check("unavailable + note diterima", ok.status === 200 && ok.json?.ok === true, JSON.stringify(ok.json));

  const week = await api(`/api/planner/week?start=${today}`);
  const found = week.json?.occurrences?.find((o) => o.id === occ.json.id);
  check("kejadian tersimpan sebagai unavailable", found?.status === "unavailable", JSON.stringify(found));
  check("note tersimpan", found?.note === "listrik mati [P5]", JSON.stringify(found?.note));
  globalThis.__p5Occ = occ.json?.id;
}

console.log("── 2. Weekly review membaca unavailable ──");
{
  const today = new Date().toISOString().slice(0, 10);
  const r = await api(`/api/reflection?week=${today}`);
  check("review ada", r.status === 200 && r.json?.review, JSON.stringify(r.json?.error));
  check("unavailable terhitung", r.json?.review?.unavailable >= 1, `=${r.json?.review?.unavailable}`);
  const item = r.json?.review?.unavailableList?.find((u) => u.activityName?.includes("[P5]"));
  check("unavailableList berisi konteks", item?.note === "listrik mati [P5]", JSON.stringify(item));
  check("persen tidak diwarnetkan oleh unavailable", typeof r.json?.review?.percent === "number" && !Number.isNaN(r.json.review.percent));
}

console.log("── 3. Export backup penuh ──");
{
  const res = await fetch(BASE + "/api/export");
  check("export 200", res.status === 200);
  const backup = await res.json().catch(() => null);
  check("version 2+ + struktur lengkap", (backup?.version ?? 0) >= 2 && !!backup?.workspace, `v=${backup?.version}`);
  check("punya semua koleksi", ["activities", "activityLogs", "energyLogs", "reflections", "messages", "finance"].every((k) => Array.isArray(backup?.workspace?.[k]) || k === "finance"), Object.keys(backup?.workspace ?? {}).join(","));
  check("pesan chat diekspor (person, bukan UUID)", backup?.workspace?.messages?.every((m) => typeof m.sender === "string" || m.sender === null) === true);
  check("tanpa credential/password/email", !JSON.stringify(backup).match(/passwordHash|SESSION_SECRET|service_role|@(?!example)/));
  globalThis.__p5Backup = backup;
}

console.log("── 4. Import: tolak file rusak ──");
{
  const bad1 = await api("/api/import", { method: "POST", body: JSON.stringify({ mode: "preview", data: { app: "bukan-rt" } }) });
  check("app salah ditolak", bad1.status === 400, `status=${bad1.status}`);
  const bad2 = await api("/api/import", { method: "POST", body: JSON.stringify({ mode: "preview", data: { app: "ruang-tumbuh", version: 2, workspace: { finance: { transactions: [{ date: "2026-01-01", type: "income", category: "X", amount: -5 }] } } } }) });
  check("nominal negatif ditolak", bad2.status === 400, JSON.stringify(bad2.json));
  const bad3 = await api("/api/import", { method: "POST", body: JSON.stringify({ mode: "preview", data: { app: "ruang-tumbuh", version: 2, workspace: { reflections: [{ weekStart: "2026-09-13", worked: "bukan senin" }] } } }) });
  check("weekStart bukan Senin ditolak", bad3.status === 400, JSON.stringify(bad3.json));
}

console.log("── 5. Import: preview & restore ──");
{
  const backup = globalThis.__p5Backup;
  // Sisipkan data [P5] tambahan supaya restore benar-benar menambah sesuatu.
  backup.workspace.activities.push({
    name: "[P5] Aktivitas Restore", description: "", weeklyTarget: 1,
    estimatedDurationMinutes: 30, preferredStartTime: "08:00", preferredEndTime: null,
    preferredDays: [1], active: true, createdBy: null, createdAt: new Date().toISOString(),
  });
  backup.workspace.finance.categories.push({ name: "[P5] Kategori Restore", type: "expense", bucket: "needs", monthlyTarget: 0, active: true });

  const before = await api("/api/planner/week?start=" + new Date().toISOString().slice(0, 10));
  const actBefore = before.json?.activities?.length ?? 0;

  const prev = await api("/api/import", { method: "POST", body: JSON.stringify({ mode: "preview", data: backup }) });
  check("preview 200 + ringkasan", prev.status === 200 && typeof prev.json?.summary === "string", JSON.stringify(prev.json));

  const rest = await api("/api/import", { method: "POST", body: JSON.stringify({ mode: "restore", data: backup }) });
  check("restore 200", rest.status === 200, JSON.stringify(rest.json));

  const after = await api("/api/planner/week?start=" + new Date().toISOString().slice(0, 10));
  const actAfter = after.json?.activities?.length ?? 0;
  check("restore menambah tanpa menghapus (aktivitas bertambah)", actAfter > actBefore, `${actBefore} → ${actAfter}`);
  const stillThere = after.json?.activities?.some((a) => a.name === "[P5] Setup alat");
  check("data lama tidak terhapus", stillThere === true);

  const rest2 = await api("/api/import", { method: "POST", body: JSON.stringify({ mode: "restore", data: backup }) });
  check("restore kedua idempoten (duplikat dilewati)", rest2.status === 200, JSON.stringify(rest2.json));
  const after2 = await api("/api/planner/week?start=" + new Date().toISOString().slice(0, 10));
  const actAfter2 = after2.json?.activities?.length ?? 0;
  check("tidak ada duplikasi baru", actAfter2 === actAfter, `${actAfter} → ${actAfter2}`);
}

console.log("── 6. Pesan chat dibatasi panjang ──");
{
  const long = "a".repeat(2001);
  const r = await api("/api/messages", { method: "POST", body: JSON.stringify({ content: long }) });
  check("pesan >2000 karakter ditolak", r.status === 400, `status=${r.status}`);
}

console.log(`\nHASIL: ${pass} lolos, ${fail} gagal`);
process.exit(fail > 0 ? 1 : 0);
