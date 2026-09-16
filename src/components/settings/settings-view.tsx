"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  LogOut,
  Download,
  Upload,
  UserRound,
  UsersRound,
  Palette,
  DatabaseBackup,
  ShieldCheck,
  Smartphone,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { initials } from "@/lib/format";
import { parseBukuKasHtml } from "@/lib/legacy-bukukas-html";
import type { SessionContext } from "@/lib/types";

export function SettingsView({ session }: { session: SessionContext }) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(session.user.displayName);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<{ summary: string; data: unknown } | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

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

  async function onBackupFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "File terlalu besar (maksimal 20 MB)." });
      return;
    }
    let data: unknown;
    let sourceNote = "";
    try {
      const text = await file.text();
      if (/\.html?$/i.test(file.name)) {
        const result = parseBukuKasHtml(text);
        data = result.data;
        sourceNote = `Buku Kas HTML terdeteksi; ${result.excludedTransactions} transaksi tanggal 1–7 September 2026 dikecualikan. `;
      } else {
        data = JSON.parse(text);
      }
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "File backup tidak dapat dibaca." });
      return;
    }
    setImporting(true);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview", data }),
      });
      const out = (await res.json().catch(() => null)) as { summary?: string; error?: string } | null;
      if (!res.ok) {
        toast({ title: out?.error ?? "File backup tidak valid." });
        return;
      }
      setPendingRestore({ summary: `${sourceNote}${out?.summary ?? ""}`, data });
    } catch {
      toast({ title: "Tidak dapat menghubungi server." });
    } finally {
      setImporting(false);
    }
  }

  async function doRestore() {
    if (!pendingRestore) return;
    setImporting(true);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "restore", data: pendingRestore.data }),
      });
      const out = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) {
        toast({ title: out?.error ?? "Pemulihan gagal. Data tidak diubah." });
        return;
      }
      toast({ title: out?.message ?? "Pemulihan selesai." });
      setPendingRestore(null);
      router.refresh();
    } catch {
      toast({ title: "Tidak dapat menghubungi server." });
    } finally {
      setImporting(false);
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

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Konfirmasi kata sandi baru belum sama." });
      return;
    }
    setChangingPassword(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast({ title: data?.error ?? "Kata sandi belum diubah." });
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Kata sandi diperbarui. Silakan masuk lagi." });
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.reload();
    } catch {
      toast({ title: "Tidak dapat menghubungi server." });
    } finally {
      setChangingPassword(false);
    }
  }

  const roleLabel = (role: string) => (role === "owner" ? "pemilik" : "pasangan");

  return (
    <section aria-label="Pengaturan" className="space-y-6 max-w-3xl">
      <div>
        <p className="rt-kicker">pengaturan</p>
        <h2 className="font-[family-name:var(--font-fraunces)] text-[1.35rem] xs:text-2xl sm:text-3xl font-semibold tracking-[-0.02em] mt-2 leading-[1.15]">
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
          Unduh cadangan lengkap: aktivitas, log, energi, refleksi, komentar, chat,
          dan seluruh Buku Kas — dalam satu file JSON. File ini berisi data pribadi
          kalian: simpan di tempat aman dan jangan dibagikan. Pemulihan hanya
          MENAMBAH data — tidak pernah menghapus atau menimpa.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={exportData} disabled={exporting} className="h-9">
            {exporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            Unduh cadangan
          </Button>
          <Label
            htmlFor="backup-file"
            className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-transparent px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Upload className="w-3.5 h-3.5" aria-hidden="true" />}
            Pulihkan dari file
          </Label>
          <input
            id="backup-file"
            type="file"
            accept="application/json,.json,text/html,.html,.htm"
            className="sr-only"
            onChange={onBackupFile}
            disabled={importing}
          />
        </div>
        {pendingRestore && (
          <div className="mt-4 rounded-xl border border-rt-teal/30 bg-rt-teal/[0.05] px-4 py-3">
            <p className="rt-kicker text-[0.55rem] mb-1">pratinjau pemulihan</p>
            <p className="text-[0.84rem] leading-relaxed">{pendingRestore.summary}</p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" className="h-9" onClick={doRestore} disabled={importing}>
                {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                Pulihkan sekarang
              </Button>
              <Button size="sm" variant="outline" className="h-9" onClick={() => setPendingRestore(null)} disabled={importing}>
                Batal
              </Button>
            </div>
          </div>
        )}
        <p className="rt-fine mt-4 flex items-start gap-2">
          <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          Pemulihan hanya bisa dilakukan oleh pemilik workspace, dan tidak dikirim ke
          layanan pihak ketiga mana pun.
        </p>
        <p className="rt-fine mt-2">
          Selain JSON, file <span className="font-[family-name:var(--font-plex-mono)]">buku kas.html</span> lama juga bisa dibaca. Data 1–7 September 2026 dari file tersebut dikecualikan sesuai permintaan.
        </p>
      </div>

      {/* ── Aplikasi (PWA) ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-white/[0.018] p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-3">
          <Smartphone className="w-4 h-4 text-rt-teal" aria-hidden="true" />
          <h3 className="font-semibold text-[0.95rem]">Aplikasi di ponsel</h3>
        </div>
        <p className="text-[0.86rem] text-muted-foreground leading-relaxed mb-4">
          Ruang Tumbuh bisa dipasang seperti aplikasi — dibuka langsung dari layar
          utama, tanpa address bar browser.
        </p>
        <div className="space-y-3">
          <div className="rounded-xl border border-border/70 bg-white/[0.02] px-4 py-3.5">
            <p className="text-[0.84rem] font-medium mb-1">Android · Chrome</p>
            <p className="text-[0.78rem] text-muted-foreground leading-relaxed">
              Ketuk menu titik tiga di kanan atas, lalu pilih "Tambahkan ke layar
              utama" atau "Pasang aplikasi".
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-white/[0.02] px-4 py-3.5">
            <p className="text-[0.84rem] font-medium mb-1">iPhone · Safari</p>
            <p className="text-[0.78rem] text-muted-foreground leading-relaxed">
              Ketuk tombol Bagikan (kotak dengan panah ke atas), lalu gulir dan pilih
              "Tambahkan ke Layar Utama".
            </p>
          </div>
          <p className="rt-fine flex items-start gap-2">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            Pemasangan hanya menyimpan aplikasinya — data tetap terlindungi sesi dan
            tidak pernah disimpan di cache publik perangkat.
          </p>
        </div>
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
            <form onSubmit={changePassword} className="rounded-xl border border-border/70 bg-white/[0.02] p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <KeyRound className="w-4 h-4 text-rt-lilac" aria-hidden="true" />
                <p className="text-[0.86rem] font-medium">Ganti kata sandi</p>
              </div>
              <p className="rt-fine mb-3">Gunakan password berbeda untuk tiap anggota. Setelah disimpan, semua sesi akun ini akan dikeluarkan.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <Label htmlFor="current-password" className="rt-kicker">saat ini</Label>
                  <Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="h-10 mt-1" required disabled={changingPassword} />
                </div>
                <div>
                  <Label htmlFor="new-password" className="rt-kicker">baru</Label>
                  <Input id="new-password" type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-10 mt-1" required disabled={changingPassword} />
                </div>
                <div>
                  <Label htmlFor="confirm-password" className="rt-kicker">ulangi baru</Label>
                  <Input id="confirm-password" type="password" autoComplete="new-password" minLength={12} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-10 mt-1" required disabled={changingPassword} />
                </div>
              </div>
              <Button type="submit" variant="outline" className="h-9 mt-3" disabled={changingPassword || !currentPassword || newPassword.length < 12 || !confirmPassword}>
                {changingPassword && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                Simpan kata sandi baru
              </Button>
            </form>
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
