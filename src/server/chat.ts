// Data layer server-only: pesan pribadi berdua.
// SEMUA query difilter workspaceId — ekuivalen RLS.
// Nama pengirim selalu diselesaikan ke displayName — UUID tidak pernah keluar.
import { db } from "@/lib/db";
import type { SessionContext } from "@/lib/types";

type Ctx = SessionContext;

export type MessageDTO = {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string; // ISO
  mine: boolean;
};

export async function listMessages(ctx: Ctx, limit = 200): Promise<MessageDTO[]> {
  const rows = await db.message.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const nameById = new Map(ctx.workspace.members.map((m) => [m.id, m.displayName]));
  return rows
    .reverse()
    .map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderName: nameById.get(m.senderId) ?? "Anggota",
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      mine: m.senderId === ctx.user.id,
    }));
}

/** Pesan setelah suatu waktu — dipakai polling ringan (realtime sandbox). */
export async function listMessagesAfter(ctx: Ctx, iso: string, limit = 100): Promise<MessageDTO[]> {
  const since = new Date(iso);
  if (Number.isNaN(since.getTime())) return listMessages(ctx, limit);
  const rows = await db.message.findMany({
    where: { workspaceId: ctx.workspace.id, createdAt: { gt: since } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const nameById = new Map(ctx.workspace.members.map((m) => [m.id, m.displayName]));
  return rows.map((m) => ({
    id: m.id,
    senderId: m.senderId,
    senderName: nameById.get(m.senderId) ?? "Anggota",
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    mine: m.senderId === ctx.user.id,
  }));
}

export async function sendMessage(ctx: Ctx, content: string): Promise<MessageDTO> {
  const trimmed = content.trim().slice(0, 2000);
  if (!trimmed) throw new Error("Pesan tidak boleh kosong.");
  const row = await db.message.create({
    data: { workspaceId: ctx.workspace.id, senderId: ctx.user.id, content: trimmed },
  });
  return {
    id: row.id,
    senderId: row.senderId,
    senderName: ctx.user.displayName,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    mine: true,
  };
}

export async function deleteOwnMessage(ctx: Ctx, id: string): Promise<boolean> {
  const m = await db.message.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!m || m.senderId !== ctx.user.id) return false;
  await db.message.delete({ where: { id: m.id } });
  return true;
}
