"use client";

// PESAN — obrolan pribadi berdua. Sederhana: gelembung, waktu, selesai.
// Polling ringan hanya saat chat terbuka. Interval 15 detik cukup responsif
// untuk dua orang sekaligus mengurangi request latar hingga 80%.
// Tanpa stiker/reaksi/media — cukup dua orang.
import { useEffect, useMemo, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Panel, TinySpinner } from "@/components/shared/ui-bits";
import { apiFetch } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { MessageDTO } from "@/server/chat";

type MessagesPayload = { messages: MessageDTO[] };

export function ChatSection() {
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastIsoRef = useRef<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const d = await apiFetch<MessagesPayload>("/api/messages");
        setMessages(d.messages);
        lastIsoRef.current = d.messages.length > 0 ? d.messages[d.messages.length - 1].createdAt : new Date(0).toISOString();
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Pesan gagal dimuat.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Polling pesan baru — ringan: hanya ?after=ISO
  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.hidden) return;
      try {
        const after = lastIsoRef.current ?? new Date(0).toISOString();
        const d = await apiFetch<MessagesPayload>(`/api/messages?after=${encodeURIComponent(after)}`);
        if (d.messages.length > 0) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const fresh = d.messages.filter((m) => !seen.has(m.id));
            return [...prev, ...fresh];
          });
          lastIsoRef.current = d.messages[d.messages.length - 1].createdAt;
        }
      } catch {
        // senyap — status koneksi sudah ditangani banner offline
      }
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll ke bawah saat pesan baru
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const d = await apiFetch<{ message: MessageDTO }>("/api/messages", {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setMessages((prev) => [...prev, d.message]);
      lastIsoRef.current = d.message.createdAt;
      setInput("");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pesan gagal terkirim. Periksa koneksi lalu coba lagi.");
    } finally {
      setSending(false);
    }
  }

  const byDay = useMemo(() => {
    const map = new Map<string, MessageDTO[]>();
    for (const m of messages) {
      const day = m.createdAt.slice(0, 10);
      (map.get(day) ?? map.set(day, []).get(day)!).push(m);
    }
    return [...map.entries()];
  }, [messages]);

  function jam(iso: string) {
    return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <section aria-label="Pesan pribadi" className="flex flex-col h-[calc(100dvh-11rem)] min-h-[420px]">
      <div className="px-1 pb-3">
        <p className="rt-kicker">pesan pribadi · dua anggota</p>
      </div>

      {/* Daftar pesan — mengisi ruang, menggulir di dalam */}
      <div className="flex-1 overflow-y-auto space-y-4 px-1 pb-2" role="log" aria-live="polite" aria-label="Riwayat pesan">
        {loading && (
          <Panel className="text-center py-8"><TinySpinner className="mx-auto" /></Panel>
        )}
        {!loading && messages.length === 0 && (
          <EmptyState
            icon={Send}
            title="Belum ada percakapan."
            hint="Mulai dari kabar kecil saja — di sini tidak ada yang perlu formal."
          />
        )}
        {byDay.map(([day, list]) => (
          <div key={day} className="space-y-2">
            <p className="rt-fine text-center">
              {new Date(day + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            {list.map((m) => (
              <div key={m.id} className={cn("flex flex-col", m.mine ? "items-end" : "items-start")}>
                <div
                  className={cn(
                    "max-w-[82%] rounded-2xl px-3.5 py-2.5 border",
                    m.mine
                      ? "border-rt-violet/35 bg-rt-violet/12 rounded-br-md"
                      : "border-border bg-white/[0.03] rounded-bl-md"
                  )}
                >
                  {!m.mine && (
                    <p className="rt-kicker text-[0.55rem] text-rt-teal/80">{m.senderName}</p>
                  )}
                  <p className="text-[0.9rem] leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                  <p className="rt-fine text-[0.62rem] mt-1 text-right">{jam(m.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p role="alert" className="text-[0.8rem] text-destructive px-1 pb-2">
          {error}
        </p>
      )}

      {/* Input menempel di bawah — dengan safe-area */}
      <div className="sticky bottom-0 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-[#0b0d12] via-[#0b0d12] to-transparent">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tulis pesan…"
            maxLength={2000}
            className="h-12"
            aria-label="Tulis pesan"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          />
          <Button size="icon" className="size-12 shrink-0" onClick={send} disabled={sending || !input.trim()} aria-label="Kirim pesan">
            {sending ? <TinySpinner /> : <Send className="w-[18px] h-[18px]" />}
          </Button>
        </div>
      </div>
    </section>
  );
}
