// GET  /api/reflection?week=YYYY-MM-DD → refleksi berdua + komentar + weekly review
// PUT  /api/reflection { week, ...fields } → simpan refleksi sendiri
// POST /api/reflection { week, content } → komentar untuk pasangan
import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/server/api";
import { requireContext } from "@/server/context";
import {
  getWeekReflections, upsertReflection, listComments, addComment,
  getWeeklyReview, buildInsights,
} from "@/server/reflection";
import { isISODate, weekStartOf } from "@/lib/dates";

export const dynamic = "force-dynamic";

const weekQuery = z.string().refine(isISODate, "Minggu tidak valid.");

export async function GET(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireContext();
    const raw = req.nextUrl.searchParams.get("week") ?? "";
    const week = isISODate(raw) ? weekStartOf(raw) : weekStartOf(new Date().toISOString().slice(0, 10));
    const [reflections, comments, review] = await Promise.all([
      getWeekReflections(ctx, week),
      listComments(ctx, week),
      getWeeklyReview(ctx, week),
    ]);
    return { week, myUserId: ctx.user.id, reflections, comments, review, insights: buildInsights(review, week) };
  });
}

const putSchema = z.object({
  week: z.string().refine(isISODate, "Minggu tidak valid."),
  worked: z.string().max(4000).optional(),
  blocked: z.string().max(4000).optional(),
  nextAdjustment: z.string().max(4000).optional(),
  weeklySentence: z.string().max(300).optional(),
  gratitude: z.string().max(1000).optional(),
});

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireContext();
    const body = putSchema.parse(await req.json());
    const week = weekStartOf(body.week);
    const reflection = await upsertReflection(ctx, week, body);
    return { reflection };
  });
}

const commentSchema = z.object({
  week: z.string().refine(isISODate, "Minggu tidak valid."),
  content: z.string().trim().min(1, "Komentar tidak boleh kosong.").max(1000),
});

export async function POST(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireContext();
    const body = commentSchema.parse(await req.json());
    const week = weekStartOf(body.week);
    const comment = await addComment(ctx, week, body.content);
    return { comment };
  });
}
