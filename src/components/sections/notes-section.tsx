"use client";

// NOTES — ruang menulis yang tidak cocok masuk aktivitas/refleksi/keuangan.
// Visibilitas: Private (hanya aku) / Shared (dibagikan ke pasangan).
// Keamanan ditegakkan server; UI hanya menyembunyikan yang tak relevan.
import { useMemo, useState } from "react";
import { Plus, StickyNote, Lock, Users, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { SectionHeader, EmptyState, Panel, TinySpinner } from "@/components/shared/ui-bits";
import { useApi, apiFetch } from "@/lib/client";
import { tanggalPendek } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { NoteDTO } from "@/server/notes";

type Filter = "all" | "mine" | "shared";

const VIS_LABEL = { private: "Private", shared: "Dibagikan" } as const;

export function NotesSection() {
  const { toast } = useToast();
  const { data, error, loading, refetch } = useApi<{ notes: NoteDTO[] }>("/api/notes");
  const [filter, setFilter] = useState<Filter>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editNote, setEditNote] = useState<NoteDTO | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const notes = data?.notes ?? [];
  const filtered = useMemo(() => {
    if (filter === "mine") return notes.filter((n) => n.mine);
    if (filter === "shared") return notes.filter((n) => n.visibility === "shared");
    return notes;
  }, [notes, filter]);

  const mine = notes.filter((n) => n.mine);
  const fromPartner = notes.filter((n) => !n.mine); // shared oleh partner

  async function remove(note: NoteDTO) {
    if (!window.confirm(`Hapus catatan "${note.title}"? Tidak bisa dibatalkan.`)) return;
    setDeleting(note.id);
    try {
      await apiFetch(`/api/notes/${note.id}`, { method: "DELETE" });
      toast({ title: "Catatan dihapus" });
      await refetch();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Gagal menghapus catatan." });
    } finally {
      setDeleting(null);
    }
  }

  function openNew() {
    setEditNote(null);
    setEditorOpen(true);
  }

  function openEdit(note: NoteDTO) {
    setEditNote(note);
    setEditorOpen(true);
  }

  return (
    <section className="space-y-5">
      <SectionHeader
        kicker="ruang menulis"
        title="Notes"
        action={
          <Button onClick={openNew} className="min-h-11 rounded-xl px-4">
            <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
            Catatan
          </Button>
        }
      />
      <p className="rt-fine -mt-2">Buat yang belum cocok masuk aktivitas, refleksi, atau keuangan — untuk dirimu sendiri, atau untuk dibagikan.</p>

      {/* Filter: Semua / Milikku / Dibagikan */}
      <div className="flex items-center gap-1.5" role="group" aria-label="Filter catatan">
        {(
          [
            { key: "all", label: "Semua" },
            { key: "mine", label: `Milikku (${mine.length})` },
            { key: "shared", label: `Dibagikan (${notes.filter((n) => n.visibility === "shared").length})` },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={cn(
              "min-h-9 rounded-full border px-3.5 text-[0.78rem] font-medium transition-colors",
              filter === key
                ? "border-rt-lilac/50 bg-rt-violet/15 text-rt-lilac"
                : "border-border text-muted-foreground active:bg-white/[0.04]"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground text-sm">
          <TinySpinner /> Memuat catatan…
        </div>
      )}

      {error && !loading && (
        <Panel className="border-destructive/30">
          <p className="text-sm text-destructive" role="alert">{error}</p>
          <Button variant="outline" className="mt-3 h-10" onClick={() => refetch()}>Coba lagi</Button>
        </Panel>
      )}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          icon={StickyNote}
          title={filter === "all" ? "Belum ada catatan" : "Tidak ada di saringan ini"}
          hint={
            filter === "all"
              ? "Tulis hal-hal kecil yang ingin kamu ingat — atau yang ingin kamu sampaikan tanpa harus lewat chat."
              : "Coba saringan lain, atau tulis catatan baru."
          }
        />
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-5">
          {/* Catatan milikku */}
          {filter !== "shared" && mine.length > 0 && (
            <div>
              <p className="rt-kicker mb-2.5">catatanku ({mine.length})</p>
              <div className="space-y-2.5">
                {mine.map((n) => (
                  <NoteCard key={n.id} note={n} onEdit={openEdit} onDelete={remove} deleting={deleting === n.id} />
                ))}
              </div>
            </div>
          )}
          {/* Dibagikan partner */}
          {filter !== "mine" && fromPartner.length > 0 && (
            <div>
              <p className="rt-kicker mb-2.5">dibagikan oleh pasangan</p>
              <div className="space-y-2.5">
                {fromPartner.map((n) => (
                  <NoteCard key={n.id} note={n} onEdit={openEdit} onDelete={remove} deleting={deleting === n.id} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <NoteEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editNote={editNote}
        onSaved={async (msg) => {
          setEditorOpen(false);
          toast({ title: msg });
          await refetch();
        }}
      />
    </section>
  );
}

/* ── Kartu catatan ────────────────────────────────────────────────────────── */

function NoteCard({
  note, onEdit, onDelete, deleting,
}: {
  note: NoteDTO;
  onEdit: (n: NoteDTO) => void;
  onDelete: (n: NoteDTO) => void;
  deleting: boolean;
}) {
  const preview = note.content.length > 160 ? `${note.content.slice(0, 160)}…` : note.content;
  return (
    <Panel className="group">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => note.mine && onEdit(note)}>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[0.95rem] font-semibold truncate">{note.title}</p>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold shrink-0",
                note.visibility === "shared"
                  ? "border-rt-teal/40 text-rt-teal"
                  : "border-border text-muted-foreground"
              )}
            >
              {note.visibility === "shared"
                ? <Users className="w-3 h-3" aria-hidden="true" />
                : <Lock className="w-3 h-3" aria-hidden="true" />}
              {VIS_LABEL[note.visibility]}
            </span>
          </div>
          {preview && <p className="rt-fine mt-1.5 whitespace-pre-line line-clamp-3">{preview}</p>}
          <p className="rt-fine mt-2 text-[0.68rem] text-muted-foreground/70">
            {!note.mine && `${note.authorName} · `}diubah {tanggalPendek(note.updatedAt.slice(0, 10))}
          </p>
        </div>
        {note.mine && (
          <div className="flex flex-col gap-1.5 shrink-0">
            <Button
              variant="ghost" size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-rt-lilac"
              aria-label={`Sunting ${note.title}`}
              onClick={() => onEdit(note)}
            >
              <Pencil className="w-4 h-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost" size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-destructive"
              aria-label={`Hapus ${note.title}`}
              disabled={deleting}
              onClick={() => onDelete(note)}
            >
              {deleting ? <TinySpinner /> : <Trash2 className="w-4 h-4" aria-hidden="true" />}
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ── Drawer editor — judul, isi, visibilitas (default Private) ────────────── */

function NoteEditor({
  open, onOpenChange, editNote, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editNote: NoteDTO | null;
  onSaved: (msg: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<"private" | "shared">("private");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  // Reset form saat drawer dibuka — remount via key, bukan setState di effect.
  const key = `${open ? "o" : "c"}-${editNote?.id ?? "new"}-${formKey}`;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setTitle(editNote?.title ?? "");
    setContent(editNote?.content ?? "");
    setVisibility(editNote?.visibility ?? "private");
    setErrorMsg(null);
  }

  async function save() {
    setSaving(true);
    setErrorMsg(null);
    try {
      if (editNote) {
        await apiFetch(`/api/notes/${editNote.id}`, {
          method: "PATCH",
          body: JSON.stringify({ title, content, visibility }),
        });
        await onSaved("Catatan diperbarui");
      } else {
        await apiFetch("/api/notes", {
          method: "POST",
          body: JSON.stringify({ title, content, visibility }),
        });
        await onSaved("Catatan tersimpan");
      }
    } catch (e) {
      // Gagal simpan: tulisan TIDAK dihilangkan — user bisa coba lagi.
      setErrorMsg(e instanceof Error ? e.message : "Catatan belum tersimpan. Periksa koneksi lalu coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  const canSave = title.trim().length > 0 && !saving;

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DrawerContent className="max-h-[92dvh]">
        <div className="mx-auto w-full max-w-md px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] overflow-y-auto">
          <DrawerHeader className="p-0 pt-1 pb-3 text-left">
            <DrawerTitle className="font-[family-name:var(--font-fraunces)] text-lg">
              {editNote ? "Sunting catatan" : "Catatan baru"}
            </DrawerTitle>
            <DrawerDescription>
              {visibility === "private" ? "Hanya kamu yang bisa melihat ini." : "Pasanganmu juga bisa melihat ini."}
            </DrawerDescription>
          </DrawerHeader>

          <div className="space-y-4" key={key}>
            <div className="space-y-1.5">
              <Label htmlFor="note-title" className="rt-kicker">judul</Label>
              <Input
                id="note-title"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 120))}
                placeholder="mis. Ide kejutan bulan depan"
                className="h-11"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note-content" className="rt-kicker">isi</Label>
              <Textarea
                id="note-content"
                value={content}
                onChange={(e) => setContent(e.target.value.slice(0, 20000))}
                placeholder="Tulis bebas…"
                rows={8}
                className="min-h-40 resize-y"
              />
              <p className="rt-fine text-[0.68rem]">{content.length.toLocaleString("id-ID")} / 20.000</p>
            </div>
            <div className="space-y-1.5">
              <p className="rt-kicker mb-1.5">siapa yang bisa lihat</p>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Visibilitas catatan">
                {(
                  [
                    { key: "private", label: "Private", desc: "Hanya aku", Icon: Lock },
                    { key: "shared", label: "Dibagikan", desc: "Juga pasangan", Icon: Users },
                  ] as const
                ).map(({ key: vk, label, desc, Icon }) => (
                  <button
                    key={vk}
                    type="button"
                    aria-pressed={visibility === vk}
                    onClick={() => setVisibility(vk)}
                    className={cn(
                      "min-h-14 rounded-xl border px-3 py-2 text-left transition-colors",
                      visibility === vk
                        ? "border-rt-teal/50 bg-rt-teal/10"
                        : "border-border text-muted-foreground active:bg-white/[0.04]"
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-[0.85rem] font-semibold">
                      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                      {label}
                    </span>
                    <span className="block text-[0.68rem] text-muted-foreground mt-0.5">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {errorMsg && <p role="alert" className="text-sm text-destructive">{errorMsg}</p>}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="ghost" className="h-11" disabled={saving} onClick={() => onOpenChange(false)}>
                Batal
              </Button>
              <Button className="h-11 min-w-28" disabled={!canSave} onClick={save}>
                {saving && <TinySpinner />}
                {editNote ? "Simpan" : "Simpan catatan"}
              </Button>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
