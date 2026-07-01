import type { Tables } from "@shared/types/database.types";
import type { UserRole } from "./UserRole";

export type Profile = {
  id: string;
  userName: string | null;
  role: UserRole;
  email: string | null;
  updatedAt: string;
};

export const mapToProfile = (row: Tables<"profiles">): Profile => ({
  id: row.id,
  email: row.email,
  userName: row.username,
  role: row.role,
  updatedAt: row.updated_at,
});
