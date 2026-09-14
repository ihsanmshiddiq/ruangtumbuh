// Seed akun awal — TEPAT DUA orang, tanpa registrasi publik.
// Kredensial dibaca dari .env (JANGAN pernah menaruh kredensial di source code).
// Jalankan: bun prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const db = new PrismaClient();

async function main() {
  const ownerEmail = process.env.SEED_OWNER_EMAIL;
  const ownerPassword = process.env.SEED_OWNER_PASSWORD;
  const partnerEmail = process.env.SEED_PARTNER_EMAIL;
  const partnerPassword = process.env.SEED_PARTNER_PASSWORD;

  if (!ownerEmail || !ownerPassword || !partnerEmail || !partnerPassword) {
    throw new Error(
      "SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD / SEED_PARTNER_EMAIL / SEED_PARTNER_PASSWORD wajib diisi di .env"
    );
  }

  const owner = await db.profile.upsert({
    where: { email: ownerEmail },
    update: {},
    create: {
      id: crypto.randomUUID(),
      email: ownerEmail,
      passwordHash: hashPassword(ownerPassword),
      displayName: "Ihsan",
    },
  });

  const partner = await db.profile.upsert({
    where: { email: partnerEmail },
    update: {},
    create: {
      id: crypto.randomUUID(),
      email: partnerEmail,
      passwordHash: hashPassword(partnerPassword),
      displayName: "Mitra",
    },
  });

  const workspace = await db.workspace.findFirst();
  const ws =
    workspace ??
    (await db.workspace.create({
      data: { id: crypto.randomUUID(), name: "Ruang Tumbuh" },
    }));

  for (const [user, role] of [
    [owner, "owner"],
    [partner, "partner"],
  ] as const) {
    await db.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: user.id } },
      update: {},
      create: { workspaceId: ws.id, userId: user.id, role },
    });
  }

  await db.allocationPlan.upsert({
    where: { workspaceId: ws.id },
    update: {},
    create: {
      workspaceId: ws.id,
      needsPercent: 10,
      wantsPercent: 20,
      charityPercent: 10,
      savingsPercent: 20,
      targetPercent: 40,
    },
  });

  console.log("Seed selesai:", {
    workspace: ws.name,
    members: [owner.email, partner.email],
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
