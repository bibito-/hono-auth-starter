import { use, useState } from "react";
import type { Profile } from "@client/entities/Profile";
import type { UserRole } from "@client/entities/UserRole";
import { useUserManagement } from "@client/hooks/useUserManagement";
import { AuthContext } from "@client/contexts/AuthContext";
import { Button } from "@client/components/ui/button";
import { Input } from "@client/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@client/components/ui/select";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "管理者",
  manager: "マネージャー",
  staff: "スタッフ",
  temporary: "臨時スタッフ",
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  manager: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  staff: "bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-300",
  temporary:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
};

export default function UserManagementPage() {
  const { users, loading, updateUser, deleteUser } = useUserManagement();
  const { authUser } = use(AuthContext);
  const myRole = authUser?.role ?? null;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    userName: string;
    role: UserRole;
  }>();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const adminCount = users.filter((u) => u.role === "admin").length;

  const startEdit = (user: Profile) => {
    setEditingId(user.id);
    setEditForm({ userName: user.userName ?? "", role: user.role });
  };

  const handleUpdate = async (id: string) => {
    if (!editForm) return;
    try {
      await updateUser(id, {
        username: editForm.userName,
        role: editForm.role,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setEditingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (adminCount <= 1 && users.find((u) => u.id === id)?.role === "admin") {
      setError("管理者が1人のため削除できません");
      return;
    }
    try {
      await deleteUser(id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setDeleteConfirmId(null);
    }
  };

  // 権限マトリクスの正典 = design_1。manager は admin 以外の全員を編集可・自己編集は不可。
  // サーバー（updateUser ハンドラ）と同じ判定で UI を一致させる。
  const canEditRole = (target: Profile) => {
    if (myRole === "admin") return true;
    if (myRole === "manager")
      return target.role !== "admin" && target.id !== authUser?.id;
    return false;
  };

  if (loading)
    return (
      <div className="p-8 text-center text-muted-foreground">
        読み込み中...
      </div>
    );

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">ユーザー管理</h1>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive dark:bg-destructive/20 dark:border-destructive/50 text-destructive rounded-lg text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button
            variant="link"
            size="sm"
            onClick={() => setError(null)}
            className="ml-2 text-destructive"
          >
            閉じる
          </Button>
        </div>
      )}

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border text-left text-sm text-muted-foreground">
            <th className="pb-3 font-medium">名前</th>
            {/* スタッフ区分 */}
            <th className="pb-3 font-medium">区分</th>
            <th className="pb-3 font-medium">メール</th>
            <th className="pb-3 font-medium text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b border-border hover:bg-muted">
              {editingId === user.id ? (
                <>
                  <td className="py-3 pr-4">
                    <Input
                      aria-label="名前"
                      value={editForm?.userName}
                      onChange={(e) =>
                        setEditForm(
                          (f) => f && { ...f, userName: e.target.value },
                        )
                      }
                      className="px-2 py-1 text-sm w-full"
                    />
                  </td>
                  <td className="py-3 pr-4">
                    {/* スタッフ区分 */}
                    <Select
                      value={editForm?.role}
                      onValueChange={(value) =>
                        setEditForm(
                          (f) =>
                            f && { ...f, role: value as UserRole },
                        )
                      }
                      disabled={!canEditRole(user)}
                    >
                      <SelectTrigger aria-label="区分" className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {/* admin への昇格は admin のみ。manager には admin 選択肢を出さない */}
                        {myRole === "admin" && (
                          <SelectItem value="admin">管理者</SelectItem>
                        )}
                        <SelectItem value="manager">マネージャー</SelectItem>
                        <SelectItem value="staff">スタッフ</SelectItem>
                        <SelectItem value="temporary">臨時スタッフ</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td />
                  <td className="py-3 text-right space-x-1">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleUpdate(user.id)}
                    >
                      保存
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingId(null)}
                    >
                      キャンセル
                    </Button>
                  </td>
                </>
              ) : (
                <>
                  <td className="py-3 pr-4 text-sm font-medium">
                    {user.userName ?? "―"}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${ROLE_COLORS[user.role]}`}
                    >
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-sm text-muted-foreground">
                    {user.email ?? "―"}
                  </td>
                  <td className="py-3 text-right space-x-1">
                    {canEditRole(user) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(user)}
                      >
                        編集
                      </Button>
                    )}
                    {myRole === "admin" &&
                      (deleteConfirmId === user.id ? (
                        <span className="inline-flex items-center gap-1 text-sm text-foreground">
                          本当に削除？
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(user.id)}
                          >
                            削除
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            戻る
                          </Button>
                        </span>
                      ) : (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeleteConfirmId(user.id)}
                        >
                          削除
                        </Button>
                      ))}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
