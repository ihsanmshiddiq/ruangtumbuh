import { getMembershipContext } from "@/lib/auth";
import { LoginScreen } from "@/components/auth/login-screen";
import { AppShell } from "@/components/shell/app-shell";

// Satu-satunya route pengguna. Gerbang: tanpa sesi + keanggotaan workspace
// yang valid, yang dirender hanya layar login — tidak ada data privat yang
// disentuh sebelum otorisasi terverifikasi di server.
// SELAMA MODE PRATINJAU (auth.ts → AUTH_BYPASS), konteks identitas anggota
// pertama workspace dikembalikan tanpa cookie sehingga aplikasi langsung
// terbuka; layar login tetap utuh dan diaktifkan kembali di fase akhir.
export default async function Home() {
  const session = await getMembershipContext();

  if (!session) {
    return <LoginScreen />;
  }

  return <AppShell session={session} />;
}
