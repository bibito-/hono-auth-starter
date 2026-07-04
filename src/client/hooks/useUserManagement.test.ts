import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@client/lib/apiFetch";

// apiFetch をモックする
vi.mock("@client/lib/apiFetch", () => ({ apiFetch: vi.fn() }));

import { useUserManagement } from "./useUserManagement";

const mockApiFetch = vi.mocked(apiFetch);

describe("useUserManagement.fetchUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mount 時に GET /api/users を apiFetch 経由で呼び、結果を Profile にマップする", async () => {
    // 準備: GET /api/users が profiles 行を返す（hook を初期化すると useEffect で fetchUsers が走る）
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "u-1", username: "あ", role: "staff", email: "a@x.com", updated_at: "2026-01-01" },
      ],
    } as unknown as Response);
    const { result } = renderHook(() => useUserManagement());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert
    expect(mockApiFetch).toHaveBeenCalledWith("/api/users");
    expect(result.current.users).toEqual([
      { id: "u-1", userName: "あ", role: "staff", email: "a@x.com", updatedAt: "2026-01-01" },
    ]);
  });

  it("res.ok が false のとき users を据え置き loading だけ解除する", async () => {
    // 準備: 取得失敗
    mockApiFetch.mockResolvedValue({ ok: false } as Response);
    const { result } = renderHook(() => useUserManagement());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert
    expect(result.current.users).toEqual([]);
  });
});

describe("useUserManagement.deleteUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DELETE で /api/users/:id を apiFetch 経由で呼ぶ", async () => {
    // 準備: hook を初期化（mount の fetchUsers も apiFetch 経由になるため json を備える）
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => [] } as unknown as Response);
    const { result } = renderHook(() => useUserManagement());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Act
    await act(async () => {
      await result.current.deleteUser("u-1");
    });

    // Assert
    expect(mockApiFetch).toHaveBeenCalledWith("/api/users/u-1", {
      method: "DELETE",
    });
  });

  it("成功直後に GET /api/users を再度呼び一覧を再取得する", async () => {
    // 準備: hook を初期化（mount の fetchUsers も apiFetch 経由になるため json を備える）
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => [] } as unknown as Response);
    const { result } = renderHook(() => useUserManagement());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Act
    await act(async () => {
      await result.current.deleteUser("u-1");
    });

    // Assert: mount 時の1回 + DELETE の1回 + 再取得の1回 = GET /api/users が計2回
    const getUsersCalls = mockApiFetch.mock.calls.filter(([input]) => input === "/api/users");
    expect(getUsersCalls).toHaveLength(2);
  });

  it("res.ok が false のとき throw し、再取得は行わない", async () => {
    // 準備: hook を初期化
    mockApiFetch.mockResolvedValue({ ok: false } as Response);
    const { result } = renderHook(() => useUserManagement());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Act / Assert
    await expect(result.current.deleteUser("u-1")).rejects.toThrow();
    const getUsersCalls = mockApiFetch.mock.calls.filter(([input]) => input === "/api/users");
    expect(getUsersCalls).toHaveLength(1);
  });
});

describe("useUserManagement.updateUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PATCH で /api/users/:id を apiFetch 経由で呼ぶ", async () => {
    // 準備: hook を初期化（mount の fetchUsers も apiFetch 経由になるため json を備える）
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => [] } as unknown as Response);
    const { result } = renderHook(() => useUserManagement());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Act
    await act(async () => {
      await result.current.updateUser("u-1", {
        username: "新名",
        role: "manager",
      });
    });

    // Assert
    expect(mockApiFetch).toHaveBeenCalledWith("/api/users/u-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "新名", role: "manager" }),
    });
  });

  it("成功直後に GET /api/users を再度呼び一覧を再取得する", async () => {
    // 準備: hook を初期化（mount の fetchUsers も apiFetch 経由になるため json を備える）
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => [] } as unknown as Response);
    const { result } = renderHook(() => useUserManagement());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Act
    await act(async () => {
      await result.current.updateUser("u-1", { role: "manager" });
    });

    // Assert: mount 時の1回 + PATCH の1回 + 再取得の1回 = GET /api/users が計2回
    const getUsersCalls = mockApiFetch.mock.calls.filter(([input]) => input === "/api/users");
    expect(getUsersCalls).toHaveLength(2);
  });

  it("res.ok が false のとき throw し、再取得は行わない", async () => {
    // 準備: hook を初期化
    mockApiFetch.mockResolvedValue({ ok: false } as Response);
    const { result } = renderHook(() => useUserManagement());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Act / Assert
    await expect(
      result.current.updateUser("u-1", { role: "staff" }),
    ).rejects.toThrow();
    const getUsersCalls = mockApiFetch.mock.calls.filter(([input]) => input === "/api/users");
    expect(getUsersCalls).toHaveLength(1);
  });
});
