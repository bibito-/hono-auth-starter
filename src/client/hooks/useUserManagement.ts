import { supabase } from "@client/clients/supabaseClient";
import { mapToProfile, type Profile } from "@client/entities/Profile";
import type { UserRole } from "@client/entities/UserRole";
import { apiFetch } from "@client/lib/apiFetch";
import type { Tables } from "@shared/types/database.types";
import { useEffect, useState } from "react";

export function useUserManagement() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    // Hono の GET /api/users（caller JWT + publishable + RLS）へ委譲。
    // requireRole(["admin","manager"]) が入口ゲート、RLS が 2 枚目の防御。
    // 取得失敗時は users を据え置き、finally で loading だけ解除する。
    try {
      const res = await apiFetch("/api/users");
      if (!res.ok) return;
      const data = (await res.json()) as Tables<"profiles">[];
      setUsers(data.map(mapToProfile));
    } finally {
      setLoading(false);
    }
  };

  const updateUser = async (
    id: string,
    updates: { username?: string; role?: UserRole },
  ) => {
    // Hono の PATCH /api/users/:id（service_role + サーバーサイド RBAC）へ委譲。
    // role 列は authenticated から REVOKE 済みのため直叩きは不可。UI 更新は
    // Realtime（profiles UPDATE）に委ね、楽観的更新は足さない。
    const res = await apiFetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("ユーザー更新に失敗しました");
  };

  const deleteUser = async (id: string) => {
    // Hono の DELETE /api/users/:id（service_role + サーバーサイド RBAC）へ委譲。
    // UI 更新は Realtime（profiles DELETE）に委ね、楽観的更新は足さない。
    const res = await apiFetch(`/api/users/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("ユーザー削除に失敗しました");
  };

  useEffect(() => {
    const channel = supabase
      .channel("profiles-modify")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        fetchUsers,
      )
      .subscribe();
    fetchUsers();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { users, loading, updateUser, deleteUser };
}
