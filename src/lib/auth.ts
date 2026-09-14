// Sesi login server-side (sandbox mirror dari Supabase Auth).
// Cookie HttpOnly bertanda tangan HMAC-SHA256 — token tidak bisa dipalsukan dari browser.
// Di produksi (Supabase), file ini digantikan oleh @supabase/ssr auth helpers.
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "rt_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 hari

export type SessionContext = {
  user: { id: string; email: string; displayName: string };
  workspace: {
    id: string;
    name: string;
    role: string; // "owner" | "partner" — diambil dari DB, bukan dari frontend
    members: { id: string; displayName: string; role: string }[];
  };
};

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET belum dikonfigurasi di .env");
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

function createToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + MAX_AGE_SECONDS * 1000 })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
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
  store.set(SESSION_COOKIE, createToken(profile.id), {
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

/**
 * Rantau otorisasi setara RLS:
 * auth.uid() → workspace_members → workspace_id → data.
 * Dipanggil di SETIAP API route — frontend tidak pernah dipercaya.
 */
export async function getMembershipContext(): Promise<SessionContext | null> {
  const store = await cookies();
  const userId = verifyToken(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;

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
