import { getMembershipContext } from "@/lib/auth";
import { LoginScreen } from "@/components/auth/login-screen";
import { AppShell } from "@/components/shell/app-shell";

// Satu-satunya route pengguna. Gerbang: tanpa sesi + keanggotaan workspace
// yang valid, yang dirender hanya layar login — tidak ada data privat yang
// disentuh sebelum otorisasi terverifikasi di server.
export default async function Home() {
  const session = await getMembershipContext();

  if (!session) {
    return <LoginScreen />;
  }

  return <AppShell session={session} />;
}
