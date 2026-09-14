// GET  /api/messages?after=ISO → semua pesan, atau hanya pesan baru (polling)
// POST /api/messages { content } → kirim pesan
import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/server/api";
import { requireContext } from "@/server/context";
import { listMessages, listMessagesAfter, sendMessage } from "@/server/chat";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireContext();
    const after = req.nextUrl.searchParams.get("after");
    if (after) {
      const messages = await listMessagesAfter(ctx, after);
      return { messages };
    }
    return { messages: await listMessages(ctx) };
  });
}

const schema = z.object({
  content: z.string().trim().min(1, "Pesan tidak boleh kosong.").max(2000),
});

export async function POST(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireContext();
    const body = schema.parse(await req.json());
    const message = await sendMessage(ctx, body.content);
    return { message };
  });
}
