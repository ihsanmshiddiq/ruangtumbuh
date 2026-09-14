"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Eye, EyeOff, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Gagal masuk. Coba lagi.");
        return;
      }
      // Muat ulang server component — sesi valid kini dirender sebagai app shell.
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server. Periksa koneksi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="rt-sheet w-full max-w-md p-8 sm:p-10">
        <div className="rt-glow-ring -top-28 -right-24 w-72 h-72" aria-hidden="true" />

        <div className="relative z-[1]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-rt-teal/80 mb-3">
                <Leaf className="w-4 h-4" aria-hidden="true" />
                <span className="rt-kicker">ruang privat · dua anggota</span>
              </div>
              <h1 className="font-[family-name:var(--font-fraunces)] text-4xl sm:text-[2.6rem] leading-[1.05] font-semibold tracking-[-0.03em]">
                Ruang Tumbuh
              </h1>
              <p className="font-[family-name:var(--font-fraunces)] italic text-muted-foreground mt-3 text-[0.95rem]">
                Jalan boleh berubah. Arah jangan.
              </p>
            </div>
            <div
              className="hidden sm:flex shrink-0 rotate-2 flex-col items-center justify-center w-[86px] h-[86px] rounded-3xl border border-white/16 bg-gradient-to-br from-rt-violet/20 to-rt-teal/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              aria-hidden="true"
            >
              <span className="text-[0.52rem] uppercase tracking-[0.14em] text-muted-foreground">
                untuk
              </span>
              <span className="font-[family-name:var(--font-plex-mono)] text-xl font-semibold text-rt-lilac">
                2 org
              </span>
            </div>
          </div>

          <div className="h-px bg-border my-7" aria-hidden="true" />

          <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  Kata sandi
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={loading}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-foreground transition-colors rounded-md"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 font-semibold shadow-[0_10px_24px_rgba(111,95,247,0.22)] hover:brightness-110 transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    Memeriksa…
                  </>
                ) : (
                  "Masuk"
                )}
              </Button>
            </div>
          </form>

          <div className="h-px bg-border my-7" aria-hidden="true" />

          <p className="rt-fine text-center">
            Tanpa pendaftaran publik. Hanya dua orang yang ditunjuk pemilik workspace
            yang bisa masuk ke ruang ini.
          </p>
        </div>
      </div>
    </main>
  );
}
