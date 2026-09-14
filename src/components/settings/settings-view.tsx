"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  LogOut,
  Download,
  UserRound,
  UsersRound,
  Palette,
  DatabaseBackup,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { initials } from "@/lib/format";
import type { SessionContext } from "@/lib/types";

export function SettingsView({ session }: { session: SessionContext }) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(session.user.displayName);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: "Nama tampilan tidak boleh kosong." });
      return;
    }
    if (trimmed === session.user.displayName) return;
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: trimmed }),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!res.ok) {
        toast({ title: data?.error ?? "Gagal menyimpan nama." });
        return;
      }
      toast({ title: "Nama tampilan diperbarui." });
      router.refresh();
    } catch {
      toast({ title: "Tidak dapat menghubungi server." });
    } finally {
      setSaving(false);
    }
  }

  async function exportData() {
    setExporting(true);
    try {
      const res = await fetch("/api/export");
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ruang-tumbuh-ekspor-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Cadangan JSON diunduh." });
    } catch {
      toast({ title: "Ekspor gagal. Coba lagi." });
    } finally {
      setExporting(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.reload();
    }
  }

  const roleLabel = (role: string) => (role === "owner" ? "pemilik" : "pasangan");

  return (
    <section aria-label="Pengaturan" className="space-y-6 max-w-3xl">
      <div>
        <p className="rt-kicker">pengaturan</p>
        <h2 className="font-[family-name:var(--font-fraunces)] text-2xl sm:text-3xl font-semibold tracking-[-0.02em] mt-2">
          Profil, workspace &amp; data
        </h2>
      </div>

      {/* ── Profil ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-white/[0.018] p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-5">
          <UserRound className="w-4 h-4 text-rt-violet" aria-hidden="true" />
          <h3 className="font-semibold text-[0.95rem]">Profil</h3>
        </div>
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rt-violet/35 to-rt-teal/25 border border-white/10 grid place-items-center font-[family-name:var(--font-plex-mono)] text-base font-semibold text-rt-lilac shrink-0"
            aria-hidden="true"
          >
            {initials(name || session.user.displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <Label htmlFor="displayName" className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
              Nama tampilan
            </Label>
            <div className="flex flex-col sm:flex-row gap-2 mt-1.5">
              <Input
                id="displayName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                className="max-w-xs"
              />
              <Button
                variant="outline"
                onClick={saveName}
                disabled={saving || name.trim() === session.user.displayName}
                className="h-9 shrink-0"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                Simpan
              </Button>
            </div>
            <p className="rt-fine mt-2">Masuk sebagai {session.user.email}</p>
          </div>
        </div>
      </div>

      {/* ── Workspace ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-white/[0.018] p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-5">
          <UsersRound className="w-4 h-4 text-rt-teal" aria-hidden="true" />
          <h3 className="font-semibold text-[0.95rem]">Workspace</h3>
        </div>
        <p className="text-[0.88rem] mb-4">
          {session.workspace.name}{" "}
          <span className="text-muted-foreground text-[0.78rem]">
            · tepat dua anggota
          </span>
        </p>
        <ul className="space-y-3">
          {session.workspace.members.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-xl border border-border/70 bg-white/[0.02] px-4 py-3"
            >
              <div
                className="w-9 h-9 rounded-full bg-gradient-to-br from-rt-violet/30 to-rt-teal/20 border border-white/10 grid place-items-center font-[family-name:var(--font-plex-mono)] text-[0.65rem] font-semibold text-rt-lilac shrink-0"
                aria-hidden="true"
              >
                {initials(m.displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[0.86rem] font-medium truncate">
                  {m.displayName}
                  {m.id === session.user.id && (
                    <span className="text-muted-foreground font-normal"> · kamu</span>
                  )}
                </p>
              </div>
              <span className="rt-kicker border border-border rounded-md px-2 py-1">
                {roleLabel(m.role)}
              </span>
            </li>
          ))}
        </ul>
        <p className="rt-fine mt-4 flex items-start gap-2">
          <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          Peran disimpan di server (tabel keanggotaan workspace). Menambah anggota baru
          tidak dilakukan dari aplikasi — hanya lewat proses aman oleh pemilik.
        </p>
      </div>

      {/* ── Tampilan ───────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-white/[0.018] p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-3">
          <Palette className="w-4 h-4 text-rt-lilac" aria-hidden="true" />
          <h3 className="font-semibold text-[0.95rem]">Tampilan</h3>
        </div>
        <p className="text-[0.86rem] text-muted-foreground leading-relaxed">
          Tema gelap editorial aktif sebagai bawaan — sesuai identitas Ruang Tumbuh.
          Sakelar terang/gelap akan hadir di fase pemolesan akhir.
        </p>
      </div>

      {/* ── Data ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-white/[0.018] p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-3">
          <DatabaseBackup className="w-4 h-4 text-rt-good" aria-hidden="true" />
          <h3 className="font-semibold text-[0.95rem]">Data</h3>
        </div>
        <p className="text-[0.86rem] text-muted-foreground leading-relaxed mb-4">
          Unduh salinan data workspace yang bisa kamu akses, dalam format JSON portabel.
          Ekspor penuh (aktivitas, log, refleksi, transaksi) akan terisi otomatis
          seiring data terbentuk di fase berikutnya. Impor tidak akan pernah menimpa
          data tanpa konfirmasi eksplisit.
        </p>
        <Button variant="outline" onClick={exportData} disabled={exporting} className="h-9">
          {exporting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          Ekspor data saya
        </Button>
      </div>

      {/* ── Akun ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-white/[0.018] p-5 sm:p-6">
        <h3 className="font-semibold text-[0.95rem] mb-3">Akun</h3>
        {session.authMode === "bypass" ? (
          <>
            <p className="text-[0.86rem] text-muted-foreground mb-4">
              Mode pratinjau aktif — gerbang masuk dinonaktifkan sementara selama
              pengembangan, dan aplikasi dibuka sebagai anggota pertama workspace.
              Layar masuk email + kata sandi akan diaktifkan kembali di fase akhir,
              lengkap dengan sesi cookie HttpOnly yang berlaku 30 hari.
            </p>
            <p className="rt-fine flex items-start gap-2">
              <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              Fitur login tidak dihapus — hanya ditunda. Semua data tetap terikat
              pada workspace dan anggotanya di server.
            </p>
          </>
        ) : (
          <>
            <p className="text-[0.86rem] text-muted-foreground mb-4">
              Sesi disimpan aman di cookie HttpOnly dan berlaku 30 hari.
            </p>
            <Button
              variant="outline"
              onClick={handleLogout}
              disabled={loggingOut}
              className="h-9 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60"
            >
              {loggingOut ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              Keluar
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
