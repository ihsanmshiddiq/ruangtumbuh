// Tipe bersama client/server — tanpa import server apa pun.
export type SessionContext = {
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
  | "chat"
  | "settings";
