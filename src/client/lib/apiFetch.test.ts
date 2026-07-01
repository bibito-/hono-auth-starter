import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./apiFetch";
import { supabase } from "../clients/supabaseClient";

// supabase クライアントの getSession・signOut をモックする
vi.mock("../clients/supabaseClient", () => ({
  supabase: { auth: { getSession: vi.fn(), signOut: vi.fn() } },
}));

const mockGetSession = vi.mocked(supabase.auth.getSession);
const mockSignOut = vi.mocked(supabase.auth.signOut);

beforeEach(() => {
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue({
    data: { session: null },
  } as Awaited<ReturnType<typeof supabase.auth.getSession>>);
  mockSignOut.mockReset();
  mockSignOut.mockResolvedValue({ error: null });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("ok")));
  vi.stubGlobal("location", { href: "" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// fetch に渡された init を取り出す
function lastFetchInit(): RequestInit {
  const mock = vi.mocked(fetch);
  return mock.mock.calls[0][1] as RequestInit;
}

// fetch に渡された input（URL）を取り出す
function lastFetchInput(): string {
  const mock = vi.mocked(fetch);
  return mock.mock.calls[0][0] as string;
}

describe("apiFetch", () => {
  it("セッションがあるとき Authorization ヘッダーに Bearer トークンを付与する", async () => {
    // Arrange
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "tok-abc" } },
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>);

    // Act
    await apiFetch("/api/todos/analyze", { method: "POST" });

    // Assert
    const headers = new Headers(lastFetchInit().headers);
    expect(headers.get("Authorization")).toBe("Bearer tok-abc");
  });

  it("セッションがないとき Authorization ヘッダーを付与しない", async () => {
    // Arrange
    mockGetSession.mockResolvedValue({
      data: { session: null },
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>);

    // Act
    await apiFetch("/api/todos/analyze");

    // Assert
    const headers = new Headers(lastFetchInit().headers);
    expect(headers.has("Authorization")).toBe(false);
  });

  it("既存の init ヘッダーを保持したまま Authorization を追加する", async () => {
    // Arrange
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "tok-abc" } },
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>);

    // Act
    await apiFetch("/api/todos/analyze", {
      headers: { "Content-Type": "application/json" },
    });

    // Assert
    const headers = new Headers(lastFetchInit().headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer tok-abc");
  });

  describe("401 ハンドリング", () => {
    it("401 レスポンス時に signOut を呼び出す", async () => {
      // Arrange
      vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));

      // Act
      await apiFetch("/api/todos");

      // Assert
      expect(mockSignOut).toHaveBeenCalledOnce();
    });

    it("401 レスポンス時に /login へリダイレクトする", async () => {
      // Arrange
      vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));

      // Act
      await apiFetch("/api/todos");

      // Assert
      expect(window.location.href).toBe("/login");
    });

    it("401 以外のレスポンス時は signOut もリダイレクトもしない", async () => {
      // Arrange
      vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403 })));

      // Act
      await apiFetch("/api/todos");

      // Assert
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(window.location.href).toBe("");
    });
  });

  describe("ベース URL の解決", () => {
    it("VITE_API_BASE_URL が設定されているとき絶対 URL に前置する", async () => {
      // Arrange: env にベース URL を設定（Vercel ビルドを想定）
      vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");

      // Act
      await apiFetch("/api/todos/analyze", { method: "POST" });

      // Assert
      expect(lastFetchInput()).toBe("https://api.example.com/api/todos/analyze");
    });

    it("VITE_API_BASE_URL が未設定のとき相対パスのまま fetch する", async () => {
      // Arrange: env 未設定（統合 dev / 段階カットオーバー中を想定）
      vi.stubEnv("VITE_API_BASE_URL", "");

      // Act
      await apiFetch("/api/todos/analyze");

      // Assert
      expect(lastFetchInput()).toBe("/api/todos/analyze");
    });
  });
});
