// Server-only. Gerbang satu pintu untuk semua route API: konteks sesi
// (cookie ATAU bypass pratinjau) atau gagal. Ekuivalen RLS di sandbox.
import { getMembershipContext } from "@/lib/auth";

export type Ctx = Awaited<ReturnType<typeof getMembershipContext>>;

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
  }
}

export async function requireContext(): Promise<NonNullable<Ctx>> {
  const ctx = await getMembershipContext();
  if (!ctx) throw new UnauthorizedError();
  return ctx;
}
