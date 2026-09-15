// Data layer server-only: pesan pribadi berdua.
// Semua query lewat klien pengguna — RLS Supabase menegakkan batas workspace.
// Nama pengirim selalu diselesaikan ke displayName — UUID tidak pernah keluar.
// Pesan bersifat append-only (RLS tidak menyediakan update/delete) — sesuai
// desain Fase 5: isi percakapan tidak bisa diubah lewat API oleh siapa pun.
import type { SessionContext } from "@/lib/types";
import { getSupabaseFor, unwrap } from "@/server/db";

type Ctx = SessionContext;

export type MessageDTO = {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string; // ISO
  mine: boolean;
};

type MessageRow = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

function toDTO(
  ctx: Ctx,
  m: MessageRow,
  nameById: Map<string, string>
): MessageDTO {
  return {
    id: m.id,
    senderId: m.sender_id,
    senderName: nameById.get(m.sender_id) ?? "Anggota",
    content: m.content,
    createdAt: new Date(m.created_at).toISOString(),
    mine: m.sender_id === ctx.user.id,
  };
}

export async function listMessages(ctx: Ctx, limit = 200): Promise<MessageDTO[]> {
  const sb = await getSupabaseFor(ctx);
  const nameById = new Map(ctx.workspace.members.map((m) => [m.id, m.displayName]));
  const rows = unwrap(
    await sb
      .from("messages")
      .select("id, sender_id, content, created_at")
      .eq("workspace_id", ctx.workspace.id)
      .order("created_at", { ascending: false })
      .limit(limit)
  ) as MessageRow[];
  return rows
    .reverse()
    .map((m) => toDTO(ctx, m, nameById));
}

/** Pesan setelah suatu waktu — dipakai polling ringan. */
export async function listMessagesAfter(ctx: Ctx, iso: string, limit = 100): Promise<MessageDTO[]> {
  const since = new Date(iso);
  if (Number.isNaN(since.getTime())) return listMessages(ctx, limit);
  const sb = await getSupabaseFor(ctx);
  const nameById = new Map(ctx.workspace.members.map((m) => [m.id, m.displayName]));
  const rows = unwrap(
    await sb
      .from("messages")
      .select("id, sender_id, content, created_at")
      .eq("workspace_id", ctx.workspace.id)
      .gt("created_at", since.toISOString())
      .order("created_at", { ascending: true })
      .limit(limit)
  ) as MessageRow[];
  return rows.map((m) => toDTO(ctx, m, nameById));
}

export async function sendMessage(ctx: Ctx, content: string): Promise<MessageDTO> {
  const trimmed = content.trim().slice(0, 2000);
  if (!trimmed) throw new Error("Pesan tidak boleh kosong.");
  const sb = await getSupabaseFor(ctx);
  const row = unwrap(
    await sb
      .from("messages")
      .insert({
        workspace_id: ctx.workspace.id,
        sender_id: ctx.user.id, // dari sesi — RLS menegakkan juga
        content: trimmed,
      })
      .select("id, sender_id, content, created_at")
      .single()
  ) as MessageRow;
  return {
    id: row.id,
    senderId: row.sender_id,
    senderName: ctx.user.displayName,
    content: row.content,
    createdAt: new Date(row.created_at).toISOString(),
    mine: true,
  };
}
