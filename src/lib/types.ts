// Tipe bersama client/server — tanpa import server apa pun.
export type SessionContext = {
  authMode: "supabase" | "bypass"; // bypass = mode pratinjau lokal tanpa login (tidak pernah di produksi)
  user: { id: string; email: string; displayName: string };
  workspace: {
    id: string;
    name: string;
    role: string; // "owner" | "partner" — dari DB, bukan dari frontend
    members: { id: string; displayName: string; role: string }[];
  };
};

export type SectionId =
  | "today"
  | "planner"
  | "finance"
  | "reflection"
  | "notes"
  | "chat"
  | "settings";
