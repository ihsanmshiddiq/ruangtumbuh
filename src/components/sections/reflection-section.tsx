"use client";

// REVIEW MINGGUAN — data dulu, refleksi belakangan. Tanpa skor produktivitas,
// tanpa gamifikasi, tanpa vonis: angka hanya angka.
// Urutan (Fase 4): apa yang terjadi → pola yang terlihat → refleksi → minggu depan.
import { useEffect, useState } from "react";
import {
  NotebookPen, ChevronLeft, ChevronRight, Send, MessageCircle,
  CalendarArrowDown, SkipForward, Clock, Wallet, Sparkles, CircleSlash,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeader, EmptyState, Panel, TinySpinner } from "@/components/shared/ui-bits";
import { useApi, apiFetch } from "@/lib/client";
import { weekStartOf, addDays, tanggalPendek, durasiMenit } from "@/lib/dates";
import { rupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReflectionDTO, CommentDTO, WeeklyReview, FinanceTwoWeeks } from "@/server/reflection";

type ReflectionPayload = {
  week: string;
  myUserId: string;
  reflections: ReflectionDTO[];
  comments: CommentDTO[];
  review: WeeklyReview;
  finance: FinanceTwoWeeks;
  insights: string[];
  reviewStatus: "not-started" | "done";
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
  const thisWeek = weekStartOf(new Date().toISOString().slice(0, 10));
  const { data, error, loading, refetch } = useApi<ReflectionPayload>(`/api/reflection?week=${anchor}`);

  return (
    <section aria-label="Review mingguan" className="space-y-6">
      <SectionHeader
        kicker="review mingguan"
        title={rentangJudul(data?.week ?? anchor)}
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

      {loading && !data && (
        <Panel className="text-center py-8"><TinySpinner className="mx-auto" /></Panel>
      )}

      {data && (
        <>
          {/* Status ringan: apakah review minggu ini sudah ditulis? */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rt-kicker rounded-md border px-2 py-1 text-[0.55rem]",
                data.reviewStatus === "done"
                  ? "border-rt-good/40 bg-rt-good/10 text-rt-good"
                  : "border-border text-muted-foreground"
              )}
            >
              {data.reviewStatus === "done" ? "review ditulis" : "belum direview"}
            </span>
            {anchor < thisWeek && <span className="rt-fine">minggu lampau — riwayat tetap bisa dibuka</span>}
          </div>

          {/* 1. APA YANG TERJADI — aktivitas */}
          <div>
            <p className="rt-kicker mb-3">apa yang terjadi · aktivitas</p>
            {data.review.planned === 0 ? (
              <EmptyState
                icon={NotebookPen}
                title="Tidak ada aktivitas minggu ini."
                hint="Bila memang tidak direncanakan, minggu kosong juga data — refleksinya tetap bisa ditulis."
              />
            ) : (
              <Panel>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { label: "direncanakan", value: data.review.planned },
                    { label: "selesai", value: data.review.done },
                    { label: "dipindah", value: data.review.rescheduled },
                    { label: "dilewati", value: data.review.skipped },
                    { label: "tak bisa", value: data.review.unavailable },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl border border-border/70 bg-white/[0.02] px-3 py-2.5">
                      <p className="font-[family-name:var(--font-plex-mono)] text-lg font-semibold">{value}</p>
                      <p className="rt-kicker text-[0.55rem] mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
                <p className="rt-fine mt-3">
                  {data.review.done} dari {data.review.planned} kejadian selesai
                  {data.review.planned > 0 ? ` (${data.review.percent}%)` : ""} — angka ini data, bukan penilaian.
                </p>

                {/* Breakdown per aktivitas */}
                {data.review.perActivity.length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    <p className="rt-kicker text-[0.55rem]">per aktivitas</p>
                    {data.review.perActivity.map((a) => (
                      <div key={a.activityId} className="flex items-center justify-between gap-3 text-[0.84rem]">
                        <span className="min-w-0 truncate">{a.name}</span>
                        <span className="font-[family-name:var(--font-plex-mono)] text-[0.78rem] shrink-0">
                          {a.done} / {a.planned} selesai
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            )}
          </div>

          {/* 2. DURASI — direncanakan vs aktual, selisih bukan vonis */}
          {data.review.perActivity.some((a) => a.plannedMinutes > 0 || a.actualMinutes > 0) && (
            <Panel>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-rt-lilac" aria-hidden="true" />
                <p className="rt-kicker">waktu · direncanakan vs aktual</p>
              </div>
              <div className="space-y-2">
                {data.review.perActivity
                  .filter((a) => a.plannedMinutes > 0 || a.actualMinutes > 0)
                  .map((a) => {
                    const delta = a.actualRecorded > 0 ? a.actualMinutes - a.plannedMinutes : null;
                    return (
                      <div key={a.activityId} className="flex items-center justify-between gap-3 text-[0.84rem]">
                        <span className="min-w-0 truncate">{a.name}</span>
                        <span className="font-[family-name:var(--font-plex-mono)] text-[0.76rem] text-muted-foreground shrink-0">
                          {durasiMenit(a.plannedMinutes) || "—"} direncanakan
                          {a.actualRecorded > 0 ? ` · ${durasiMenit(a.actualMinutes)} aktual` : " · aktual belum dicatat"}
                          {delta !== null && ` · selisih ${delta > 0 ? "+" : "−"}${durasiMenit(Math.abs(delta))}`}
                        </span>
                      </div>
                    );
                  })}
              </div>
              <p className="rt-fine mt-3">
                Aktual lebih pendek bukan berarti buruk, lebih panjang bukan berarti lebih baik — yang tercatat saja yang ditampilkan.
              </p>
            </Panel>
          )}

          {/* 3. PERPINDAHAN, PENUNDAAN & TAK BISA — bagian normal perencanaan */}
          {(data.review.moves.length > 0 ||
            data.review.skippedList.length > 0 ||
            data.review.unavailableList.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.review.moves.length > 0 && (
                <Panel>
                  <div className="flex items-center gap-2 mb-3">
                    <CalendarArrowDown className="w-4 h-4 text-rt-teal" aria-hidden="true" />
                    <p className="rt-kicker">dipindah · {data.review.moves.length}×</p>
                  </div>
                  <ul className="space-y-1.5">
                    {data.review.moves.map((m, i) => (
                      <li key={`${m.activityName}-${i}`} className="text-[0.84rem] flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{m.activityName}</span>
                        <span className="font-[family-name:var(--font-plex-mono)] text-[0.74rem] text-muted-foreground">
                          {tanggalPendek(m.from)} → {tanggalPendek(m.to)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="rt-fine mt-2">Rencana berubah — bagian normal, bukan penalti.</p>
                </Panel>
              )}
              {data.review.skippedList.length > 0 && (
                <Panel>
                  <div className="flex items-center gap-2 mb-3">
                    <SkipForward className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    <p className="rt-kicker">dilewati · {data.review.skippedList.length}×</p>
                  </div>
                  <ul className="space-y-1.5">
                    {data.review.skippedList.map((s, i) => (
                      <li key={`${s.activityName}-${i}`} className="text-[0.84rem] flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{s.activityName}</span>
                        <span className="font-[family-name:var(--font-plex-mono)] text-[0.74rem] text-muted-foreground">
                          {tanggalPendek(s.date)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="rt-fine mt-2">Penyebabnya hanya kalian yang tahu — aplikasi tidak menebak.</p>
                </Panel>
              )}
              {data.review.unavailableList.length > 0 && (
                <Panel>
                  <div className="flex items-center gap-2 mb-3">
                    <CircleSlash className="w-4 h-4 text-rt-lilac" aria-hidden="true" />
                    <p className="rt-kicker">tak bisa dilakukan · {data.review.unavailableList.length}×</p>
                  </div>
                  <ul className="space-y-1.5">
                    {data.review.unavailableList.map((s, i) => (
                      <li key={`${s.activityName}-${i}`} className="text-[0.84rem] flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{s.activityName}</span>
                        <span className="font-[family-name:var(--font-plex-mono)] text-[0.74rem] text-muted-foreground">
                          {tanggalPendek(s.date)}
                        </span>
                        {s.note && <span className="text-[0.78rem] text-muted-foreground">— {s.note}</span>}
                      </li>
                    ))}
                  </ul>
                  <p className="rt-fine mt-2">Tidak digeser, bukan kegagalan — konteksnya hanya dari catatan kalian.</p>
                </Panel>
              )}
            </div>
          )}

          {/* 4. ENERGI — hati-hati, tanpa klaim sebab-akibat */}
          {data.review.energyByUser.length > 0 && (
            <Panel>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-rt-lilac" aria-hidden="true" />
                <p className="rt-kicker">energi · konteks mingguan</p>
              </div>
              <div className="space-y-2.5">
                {data.review.energyByUser.map((u) => {
                  const levels = u.days.map((d) => d.level);
                  const avg = levels.length > 0 ? (levels.reduce((s, v) => s + v, 0) / levels.length).toFixed(1) : null;
                  const min = levels.length > 0 ? Math.min(...levels) : null;
                  const max = levels.length > 0 ? Math.max(...levels) : null;
                  return (
                    <div key={u.userName}>
                      <p className="text-[0.86rem] font-medium">{u.userName}</p>
                      {avg === null ? (
                        <p className="rt-fine mt-0.5">belum ada catatan energi minggu ini</p>
                      ) : (
                        <p className="rt-fine mt-0.5">
                          rata-rata {avg} dari 3 · hari terendah {min} · hari tertinggi {max} · {levels.length} hari tercatat
                        </p>
                      )}
                      {/* strip harian: 7 kotak kecil per user */}
                      <div className="flex gap-1.5 mt-1.5" aria-hidden="true">
                        {u.days.map((d) => (
                          <span
                            key={d.date}
                            title={`${tanggalPendek(d.date)}: ${d.level}/3`}
                            className={cn(
                              "h-2 w-6 rounded-full",
                              d.level === 3 ? "bg-rt-good/70" : d.level === 2 ? "bg-rt-lilac/60" : "bg-destructive/50"
                            )}
                          />
                        ))}
                      </div>
                    </div>
                    );
                  })}
              </div>
              {data.review.lowestEnergy && data.review.rescheduledOnLowestEnergy > 0 && (
                <p className="rt-fine mt-3">
                  Catatan hati-hati: pada hari energi terendah ({tanggalPendek(data.review.lowestEnergy.date)}),
                  {" "}{data.review.rescheduledOnLowestEnergy} kejadian juga dipindah — keduanya tercatat bersamaan,
                  belum tentu satu menyebabkan yang lain.
                </p>
              )}
            </Panel>
          )}

          {/* 5. KEUANGAN MINGGU INI + perbandingan minggu lalu */}
          <div>
            <p className="rt-kicker mb-3">keuangan minggu ini</p>
            {data.finance.current.txCount === 0 && data.finance.previous.txCount === 0 ? (
              <EmptyState
                icon={Wallet}
                title="Tidak ada transaksi minggu ini dan minggu lalu."
                hint="Ringkasan keuangan muncul begitu ada transaksi tercatat di Buku Kas."
              />
            ) : (
              <Panel>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "pemasukan", value: data.finance.current.income, cls: "text-rt-good" },
                    { label: "pengeluaran", value: data.finance.current.expense, cls: "text-destructive" },
                    { label: "selisih", value: data.finance.current.diff, cls: "text-rt-lilac" },
                  ].map(({ label, value, cls }) => (
                    <div key={label} className="rounded-xl border border-border/70 bg-white/[0.02] px-3 py-2.5">
                      <p className="rt-kicker text-[0.55rem]">{label}</p>
                      <p className={cn("font-[family-name:var(--font-plex-mono)] font-semibold text-[0.9rem] mt-0.5", cls)}>
                        {rupiah(value)}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="rt-fine mt-2">{data.finance.current.txCount} transaksi tercatat minggu ini.</p>
                {data.finance.previous.txCount > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/60">
                    <p className="text-[0.84rem]">
                      Minggu lalu: {rupiah(data.finance.previous.income)} masuk · {rupiah(data.finance.previous.expense)} keluar
                    </p>
                    {data.finance.current.expense !== data.finance.previous.expense && (
                      <p className="rt-fine mt-1">
                        Pengeluaran {data.finance.current.expense < data.finance.previous.expense ? "lebih rendah" : "lebih tinggi"}{" "}
                        {rupiah(data.finance.current.expense - data.finance.previous.expense)} dibanding minggu lalu — konteksnya bisa saja berbeda.
                      </p>
                    )}
                  </div>
                )}
              </Panel>
            )}
          </div>

          {/* 6. POLA YANG TERLIHAT — setiap insight bisa ditelusuri ke angka */}
          {data.insights.length > 0 && (
            <Panel className="border-rt-teal/20 bg-rt-teal/[0.04]">
              <p className="rt-kicker mb-2">pola yang terlihat</p>
              <ul className="space-y-1.5">
                {data.insights.map((i) => (
                  <li key={i} className="text-[0.86rem] leading-relaxed flex items-start gap-2">
                    <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-gradient-to-r from-rt-violet to-rt-teal shrink-0" aria-hidden="true" />
                    {i}
                  </li>
                ))}
              </ul>
              <p className="rt-fine mt-3">Semua kalimat di atas dihitung langsung dari data minggu ini — bukan nasihat.</p>
            </Panel>
          )}

          {/* 7. REFLEKSI — interpretasi manusia, setelah data */}
          <OwnReflectionForm
            week={data.week}
            existing={data.reflections.find((r) => r.userId === data.myUserId)}
            onSaved={refetch}
          />

          {/* 8. REFLEKSI PASANGAN */}
          {data.reflections.filter((r) => r.userId !== data.myUserId).length > 0 && (
            <div className="space-y-3">
              <p className="rt-kicker">refleksi pasangan</p>
              {data.reflections
                .filter((r) => r.userId !== data.myUserId)
                .map((r) => (
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

          {/* 9. SALING MENANGGAPI */}
          <CommentsBlock
            week={data.week}
            comments={data.comments}
            myUserId={data.myUserId}
            onChanged={refetch}
          />
        </>
      )}
    </section>
  );
}

function rentangJudul(weekStart: string): string {
  return `${tanggalPendek(weekStart)} – ${tanggalPendek(addDays(weekStart, 6))}`;
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
    <div>
      <div className="flex items-center gap-2 mb-3">
        <NotebookPen className="w-4 h-4 text-rt-violet" aria-hidden="true" />
        <p className="rt-kicker">refleksiku minggu ini</p>
      </div>
      <Panel>
        <div className="space-y-4">
          {QUESTIONS.map(({ field, label, hint }) => (
            <div key={field}>
              <Label htmlFor={`rf-${week}-${field}`} className="text-[0.84rem] font-medium">{label}</Label>
              <p className="rt-fine mb-1.5">{hint}</p>
              <textarea
                id={`rf-${week}-${field}`}
                value={fields[field] ?? ""}
                onChange={(e) => setFields((f) => ({ ...f, [field]: e.target.value }))}
                rows={field === "weeklySentence" ? 2 : 3}
                maxLength={4000}
                className="w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-[0.9rem] leading-relaxed min-h-[88px] resize-y focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none placeholder:text-muted-foreground"
                placeholder="Tulis seadanya — kosongkan yang belum ingin dijawab."
              />
            </div>
          ))}
          <Button className="w-full h-11 font-semibold" onClick={save} disabled={saving || !dirty}>
            {saving && <TinySpinner />}
            {existing ? "Simpan perubahan" : "Simpan refleksi"}
          </Button>
        </div>
      </Panel>
    </div>
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
