import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { login } from "@/lib/auth";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(1).max(200),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Email atau kata sandi salah." },
      { status: 401 }
    );
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "lokal";
  const key = `login:${ip}:${parsed.data.email.toLowerCase()}`;
  // 8 percobaan / 15 menit per kombinasi IP+email.
  if (!rateLimit(key, 8, 15 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." },
      { status: 429 }
    );
  }

  try {
    const ok = await login(parsed.data.email.trim().toLowerCase(), parsed.data.password);
    if (!ok) {
      return NextResponse.json({ error: "Gagal masuk. Coba lagi." }, { status: 401 });
    }
  } catch (err) {
    // Pesan dari lib/auth sudah ramah & tidak membocorkan detail internal.
    const message = err instanceof Error ? err.message : "Gagal masuk. Coba lagi.";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  resetRateLimit(key);
  return NextResponse.json({ ok: true });
}
