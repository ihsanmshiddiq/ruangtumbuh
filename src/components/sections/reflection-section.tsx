"use client";

// REFLEKSI — tenang dan personal, bukan formulir administrasi.
// Urutan: data minggu terlebih dahulu (apa yang terjadi), baru refleksi.
// Refleksi milik masing-masing; komentar mengalir berdua, bukan feed sosial.
import { useEffect, useMemo, useState } from "react";
import { NotebookPen, ChevronLeft, ChevronRight, Send, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeader, EmptyState, Panel, TinySpinner } from "@/components/shared/ui-bits";
import { useApi, apiFetch } from "@/lib/client";
import { weekStartOf, addDays, tanggalPendek, durasiMenit } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ReflectionDTO, CommentDTO, WeeklyReview } from "@/server/reflection";

type ReflectionPayload = {
  week: string;
  myUserId: string;
  reflections: ReflectionDTO[];
  comments: CommentDTO[];
  review: WeeklyReview;
  insights: string[];
};

const QUESTIONS = [
  { field: "worked", label: "Yang berjalan baik", hint: "Apa yang terasa berjalan baik minggu ini?" },
  { field: "blocked", label: "Yang sulit", hint: "Apa yang paling sulit minggu ini?" },
  { field: "nextAdjustment", label: "Minggu depan", hint: "Apa yang ingin kamu lakukan berbeda?" },
  { field: "weeklySentence", label: "Satu kalimat", hint: "Tuliskan satu kalimat untuk minggu ini." },
  { field: "gratitude", label: "Rasa terima kasih", hint: "Hal kecil apa yang kamu syukuri minggu ini?" },
] as const;

export function ReflectionSection() {
  const { toast } = useToast();
  const [anchor, setAnchor] = useState(() => weekStartOf(new Date().toISOString().slice(0, 10)));
  const { data, error, loading, refetch } = useApi<ReflectionPayload>(`/api/reflection?week=${anchor}`);
  const thisWeek = weekStartOf(new Date().toISOString().slice(0, 10));

  const mine = useMemo(
    () => data?.reflections.find((r) => r.userId === data.myUserId),
    [data]
  );

  return (
    <section aria-label="Refleksi mingguan" className="space-y-6">
      <SectionHeader
        kicker="refleksi"
        title={`Minggu ${tanggalPendek(data?.week ?? anchor)}${data && data.week !== thisWeek ? " · lampau" : ""}`}
        action={
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" className="size-10" aria-label="Minggu sebelumnya" onClick={() => setAnchor((w) => addDays(w, -7))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-10" onClick={() => setAnchor(thisWeek)} disabled={anchor === thisWeek}>
              Minggu ini
            </Button>
            <Button variant="outline" size="icon" className="size-10" aria-label="Minggu berikutnya" onClick={() => setAnchor((w) => addDays(w, 7))} disabled={anchor >= thisWeek}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        }
      />

      {error && (
        <Panel className="border-destructive/40">
          <p className="text-[0.86rem] text-destructive">{error}</p>
        </Panel>
      )}

      {/* 1. Apa yang terjadi — data, bukan opini */}
      {data && data.review.planned > 0 ? (
        <Panel>
          <p className="rt-kicker mb-3">apa yang terjadi minggu ini</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "direncanakan", value: data.review.planned },
              { label: "selesai", value: data.review.done },
              { label: "dipindah", value: data.review.rescheduled },
              { label: "dilewati", value: data.review.skipped },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-border/70 bg-white/[0.02] px-3 py-2.5">
                <p className="font-[family-name:var(--font-plex-mono)] text-lg font-semibold">{value}</p>
                <p className="rt-kicker text-[0.55rem] mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          {data.review.perActivity.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {data.review.perActivity.map((a) => (
                <div key={a.activityId} className="flex items-center justify-between text-[0.82rem]">
                  <span className="text-muted-foreground">{a.name}</span>
                  <span className="font-[family-name:var(--font-plex-mono)] text-[0.78rem]">
                    {a.done} / {a.planned} selesai
                    {a.plannedMinutes > 0 && ` · ${durasiMenit(a.plannedMinutes)}`}
                  </span>
                </div>
              ))}
            </div>
          )}
          {data.insights.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border/60 space-y-1">
              {data.insights.map((i) => (
                <p key={i} className="rt-fine">· {i}</p>
              ))}
            </div>
          )}
        </Panel>
      ) : (
        !loading && (
          <EmptyState
            icon={NotebookPen}
            title="Belum ada aktivitas minggu ini."
            hint="Refleksi tetap bisa ditulis — data akan menyusul seiring aktivitas tercatat."
          />
        )
      )}

      {/* 2. Refleksi milik sendiri */}
      <OwnReflectionForm week={data?.week ?? anchor} existing={mine} onSaved={refetch} />

      {/* 3. Refleksi pasangan + komentar */}
      {data && data.reflections.filter((r) => r.userId !== data.myUserId).length > 0 && (
        <div className="space-y-3">
          <p className="rt-kicker">refleksi pasangan</p>
          {data.reflections.filter((r) => r.userId !== data.myUserId).map((r) => (
            <Panel key={r.id}>
              <p className="text-[0.88rem] font-semibold mb-2">{r.userName}</p>
              <dl className="space-y-2">
                {QUESTIONS.map(({ field, label }) => {
                  const val = r[field];
                  if (!val) return null;
                  return (
                    <div key={field}>
                      <dt className="rt-kicker text-[0.55rem]">{label}</dt>
                      <dd className="text-[0.86rem] leading-relaxed whitespace-pre-wrap mt-0.5">{val}</dd>
                    </div>
                  );
                })}
              </dl>
            </Panel>
          ))}
        </div>
      )}

      {/* Komentar berdua */}
      <CommentsBlock
        week={data?.week ?? anchor}
        comments={data?.comments ?? []}
        myUserId={data?.myUserId ?? ""}
        onChanged={refetch}
      />
    </section>
  );
}

function OwnReflectionForm({
  week, existing, onSaved,
}: {
  week: string;
  existing?: ReflectionDTO;
  onSaved: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const init: Record<string, string> = {};
    for (const { field } of QUESTIONS) init[field] = existing?.[field] ?? "";
    setFields(init);
  }, [existing, week]);

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/api/reflection", { method: "PUT", body: JSON.stringify({ week, ...fields }) });
      toast({ title: "Refleksi tersimpan" });
      await onSaved();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Refleksi belum tersimpan. Coba lagi." });
    } finally {
      setSaving(false);
    }
  }

  const dirty = QUESTIONS.some(({ field }) => (fields[field] ?? "") !== (existing?.[field] ?? ""));

  return (
    <Panel>
      <p className="rt-kicker mb-4">refleksiku minggu ini</p>
      <div className="space-y-4">
        {QUESTIONS.map(({ field, label, hint }) => (
          <div key={field}>
            <Label htmlFor={`rf-${field}`} className="text-[0.84rem] font-medium">{label}</Label>
            <p className="rt-fine mb-1.5">{hint}</p>
            <textarea
              id={`rf-${field}`}
              value={fields[field] ?? ""}
              onChange={(e) => setFields((f) => ({ ...f, [field]: e.target.value }))}
              rows={field === "weeklySentence" ? 2 : 3}
              maxLength={4000}
              className="w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-[0.9rem] leading-relaxed min-h-[88px] resize-y focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none placeholder:text-muted-foreground"
              placeholder="Tulis seadanya…"
            />
          </div>
        ))}
        <Button className="w-full h-11 font-semibold" onClick={save} disabled={saving || !dirty}>
          {saving && <TinySpinner />}
          {existing ? "Simpan perubahan" : "Simpan refleksi"}
        </Button>
      </div>
    </Panel>
  );
}

function CommentsBlock({
  week, comments, myUserId, onChanged,
}: {
  week: string;
  comments: CommentDTO[];
  myUserId: string;
  onChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!content.trim()) return;
    setSending(true);
    try {
      await apiFetch("/api/reflection", { method: "POST", body: JSON.stringify({ week, content }) });
      setContent("");
      toast({ title: "Komentar terkirim" });
      await onChanged();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Komentar gagal terkirim." });
    } finally {
      setSending(false);
    }
  }

  return (
    <Panel>
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle className="w-4 h-4 text-rt-teal" aria-hidden="true" />
        <p className="rt-kicker">saling menanggapi</p>
      </div>
      {comments.length === 0 ? (
        <p className="rt-fine mb-3">Belum ada komentar minggu ini — masukan, saran, atau semangat kecil.</p>
      ) : (
        <ul className="space-y-2.5 mb-3">
          {comments.map((c) => (
            <li key={c.id} className={cn("flex flex-col", c.userId === myUserId && "items-end")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-xl px-3.5 py-2.5 border",
                  c.userId === myUserId ? "border-rt-violet/30 bg-rt-violet/10" : "border-border bg-white/[0.03]"
                )}
              >
                <p className="rt-kicker text-[0.55rem]">{c.userName}</p>
                <p className="text-[0.86rem] leading-relaxed whitespace-pre-wrap mt-0.5">{c.content}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Tulis tanggapan…"
          maxLength={1000}
          className="h-11"
          aria-label="Tulis komentar"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
        />
        <Button size="icon" className="size-11 shrink-0" onClick={send} disabled={sending || !content.trim()} aria-label="Kirim komentar">
          {sending ? <TinySpinner /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </Panel>
  );
}
