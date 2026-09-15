"use client";

// Drawer "Tidak bisa dilakukan" — status unavailable.
// Beda dengan Lewati: kejadian TIDAK digeser, dan konteks opsional boleh
// dituliskan agar pasangan paham tanpa harus menebak. Kosong = tanpa alasan.
import { useState } from "react";
import { CircleSlash } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TinySpinner } from "@/components/shared/ui-bits";
import { apiFetch } from "@/lib/client";
import type { OccurrenceDTO } from "@/server/planner";

export function UnavailableDrawer({
  occ,
  onOpenChange,
  onSaved,
}: {
  occ: OccurrenceDTO | null;
  onOpenChange: (v: boolean) => void;
  onSaved: (msg: string) => void;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!occ) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/occurrences", {
        method: "PATCH",
        body: JSON.stringify({ id: occ.id, status: "unavailable", note: note.trim() }),
      });
      onSaved(`${occ.activityName} ditandai tidak bisa dilakukan.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
      setSaving(false);
    }
  }

  return (
    <Drawer open={occ !== null} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[70dvh]">
        {occ && (
          <div className="mx-auto w-full max-w-md px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] overflow-y-auto">
            <DrawerHeader className="p-0 pt-1 pb-3 text-left">
              <DrawerTitle className="font-[family-name:var(--font-fraunces)] text-lg flex items-center gap-2">
                <CircleSlash className="w-4.5 h-4.5 text-rt-lilac" aria-hidden="true" />
                Tidak bisa dilakukan: {occ.activityName}
              </DrawerTitle>
              <DrawerDescription>
                Berbeda dengan dipindah — kejadian ini tetap di waktunya, hanya
                memang tidak bisa dikerjakan. Tidak dihitung sebagai kegagalan.
              </DrawerDescription>
            </DrawerHeader>

            <div>
              <Label htmlFor="unavail-note" className="rt-kicker">
                konteks (opsional)
              </Label>
              <textarea
                id="unavail-note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 300))}
                rows={3}
                maxLength={300}
                placeholder="mis. listrik mati, sedang di perjalanan, alat sedang dipinjam…"
                className="mt-1.5 w-full min-h-[88px] rounded-xl border border-border bg-white/[0.02] px-3 py-2.5 text-[0.86rem] leading-relaxed placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rt-violet/40 resize-y"
              />
              <p className="rt-fine mt-1.5">{note.length}/300 · boleh dikosongkan</p>
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive mt-3">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <Button
                variant="outline"
                className="flex-1 h-11"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Batal
              </Button>
              <Button
                className="flex-[2] h-11 font-semibold"
                onClick={submit}
                disabled={saving}
              >
                {saving && <TinySpinner />}
                Tandai
              </Button>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
