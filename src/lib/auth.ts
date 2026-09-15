// Sesi login server-side (sandbox mirror dari Supabase Auth).
// Cookie HttpOnly bertanda tangan HMAC-SHA256 — token tidak bisa dipalsukan dari browser.
// Di produksi (Supabase), file ini digantikan oleh @supabase/ssr auth helpers.
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "rt_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 hari

// ─── Mode pratinjau (lokal saja — OPT-IN eksplisit) ──────────────────────────
// Default: AMAN — semua request wajib cookie sesi valid.
// Mode pratinjau hanya aktif bila env AUTH_BYPASS=1 diset di mesin lokal
// (lihat .env.example). Jangan pernah diset di produksi.
const AUTH_BYPASS = process.env.AUTH_BYPASS === "1";

export type SessionContext = {
  authMode: "session" | "bypass";
  user: { id: string; email: string; displayName: string };
  workspace: {
    id: string;
    name: string;
    role: string; // "owner" | "partner" — diambil dari DB, bukan dari frontend
    members: { id: string; displayName: string; role: string }[];
  };
};

// ─── Secret sesi: env → DB (AppConfig) → generate & simpan ─────────────────
// .env lingkungan sandbox bisa ter-reset saat environment di-restart, sedangkan
// file database tetap persisten — karena itu secret dicadangkan di tabel
// AppConfig (dibuat via raw SQL, di luar schema.prisma agar mirror Supabase
// tetap 1:1). Env tetap jadi sumber utama kalau ada.
let cachedSecret: string | null = null;

async function ensureAppConfigTable(): Promise<void> {
  await db.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "AppConfig" (
       "key" TEXT PRIMARY KEY,
       "value" TEXT NOT NULL,
       "updatedAt" DATETIME NOT NULL
     )`
  );
}

async function getSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;

  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }

  await ensureAppConfigTable();
  const rows = await db.$queryRawUnsafe<{ value: string }[]>(
    `SELECT value FROM "AppConfig" WHERE key = 'session_secret' LIMIT 1`
  );
  if (rows[0]?.value && rows[0].value.length >= 16) {
    cachedSecret = rows[0].value;
    return cachedSecret;
  }

  // Bootstrap sekali: buat secret acak lalu simpan permanen di DB.
  const generated = randomBytes(32).toString("base64url");
  await db.$executeRawUnsafe(
    `INSERT OR IGNORE INTO "AppConfig" ("key", "value", "updatedAt")
     VALUES ('session_secret', '${generated}', CURRENT_TIMESTAMP)`
  );
  cachedSecret = generated;
  return cachedSecret;
}

async function sign(value: string): Promise<string> {
  const secret = await getSecret();
  return createHmac("sha256", secret).update(value).digest("base64url");
}

async function createToken(userId: string): Promise<string> {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + MAX_AGE_SECONDS * 1000 })
  ).toString("base64url");
  return `${payload}.${await sign(payload)}`;
}

async function verifyToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(await sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      uid: string;
      exp: number;
    };
    if (!data.uid || typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return data.uid;
  } catch {
    return null;
  }
}

/** Verifikasi kredensial + terbitkan cookie sesi. Mengembalikan null bila gagal. */
export async function login(email: string, password: string): Promise<boolean> {
  const profile = await db.profile.findUnique({ where: { email } });
  // Pesan error selalu generik: jangan bocorkan apakah email terdaftar.
  if (!profile) return false;
  const { verifyPassword } = await import("@/lib/password");
  if (!verifyPassword(password, profile.passwordHash)) return false;
  const store = await cookies();
  store.set(SESSION_COOKIE, await createToken(profile.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
  return true;
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Rangkai konteks dari satu userId + keanggotaan workspace-nya. */
async function buildContext(
  userId: string,
  authMode: "session" | "bypass"
): Promise<SessionContext | null> {
  const profile = await db.profile.findUnique({ where: { id: userId } });
  if (!profile) return null;

  const membership = await db.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: true },
  });
  if (!membership) return null;

  const allMembers = await db.workspaceMember.findMany({
    where: { workspaceId: membership.workspaceId },
    include: { user: { select: { id: true, displayName: true } } },
    orderBy: { createdAt: "asc" },
  });

  return {
    authMode,
    user: { id: profile.id, email: profile.email, displayName: profile.displayName },
    workspace: {
      id: membership.workspace.id,
      name: membership.workspace.name,
      role: membership.role,
      // Email anggota lain sengaja tidak diekspos (setia pada model Supabase).
      members: allMembers.map((m) => ({
        id: m.user.id,
        displayName: m.user.displayName,
        role: m.role,
      })),
    },
  };
}

/**
 * Rantau otorisasi setara RLS:
 * auth.uid() → workspace_members → workspace_id → data.
 * Dipanggil di SETIAP API route — frontend tidak pernah dipercaya.
 *
 * Mode pratinjau: tanpa cookie valid, konteks identitas anggota pertama
 * (pemilik) tetap dikembalikan agar aplikasi bisa dipakai tanpa login.
 */
export async function getMembershipContext(): Promise<SessionContext | null> {
  const store = await cookies();
  const userId = await verifyToken(store.get(SESSION_COOKIE)?.value);

  if (userId) return buildContext(userId, "session");

  if (AUTH_BYPASS) {
    const firstMember = await db.workspaceMember.findFirst({
      orderBy: { createdAt: "asc" },
      select: { userId: true },
    });
    if (firstMember) return buildContext(firstMember.userId, "bypass");
  }

  return null;
}
