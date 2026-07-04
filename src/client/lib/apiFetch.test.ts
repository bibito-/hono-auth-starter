import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./apiFetch";
import { setCsrfToken } from "../services/HonoAuthService";

// CSRF トークンの取得・更新をモックする（apiFetch と HonoAuthService は
// 循環参照になるため、実体の代わりにシンプルなモジュールレベル変数でモックする）
let mockCsrfToken: string | null = null;
vi.mock("../services/HonoAuthService", () => ({
  getCsrfToken: vi.fn(() => mockCsrfToken),
  setCsrfToken: vi.fn((token: string | null) => {
    mockCsrfToken = token;
  }),
}));

const mockSetCsrfToken = vi.mocked(setCsrfToken);

beforeEach(() => {
  mockCsrfToken = null;
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("ok")));
  vi.stubGlobal("location", { href: "" });
  // ローカルの .env 等に実際の VITE_API_BASE_URL が設定されていても影響を受けないよう、
  // 個別にベース URL を検証するテスト以外はここで空文字に固定する
  vi.stubEnv("VITE_API_BASE_URL", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// fetch に渡された init を呼び出し順で取り出す
function fetchInit(callIndex = 0): RequestInit {
  const mock = vi.mocked(fetch);
  return mock.mock.calls[callIndex][1] as RequestInit;
}

// fetch に渡された input（URL）を呼び出し順で取り出す
function fetchInput(callIndex = 0): string {
  const mock = vi.mocked(fetch);
  return mock.mock.calls[callIndex][0] as string;
}

describe("apiFetch", () => {
  it("credentials: include を常に付与する", async () => {
    // Act
    await apiFetch("/api/todos");

    // Assert
    expect(fetchInit().credentials).toBe("include");
  });

  describe("CSRF トークンの付与", () => {
    it("POST リクエストかつトークンがあるとき X-CSRF-Token ヘッダーを付与する", async () => {
      // Arrange
      mockCsrfToken = "csrf-abc";

      // Act
      await apiFetch("/api/todos", { method: "POST" });

      // Assert
      const headers = new Headers(fetchInit().headers);
      expect(headers.get("X-CSRF-Token")).toBe("csrf-abc");
    });

    it("PATCH・DELETE リクエストにも X-CSRF-Token ヘッダーを付与する", async () => {
      // Arrange
      mockCsrfToken = "csrf-abc";

      // Act
      await apiFetch("/api/todos/1", { method: "PATCH" });
      await apiFetch("/api/todos/1", { method: "DELETE" });

      // Assert
      expect(new Headers(fetchInit(0).headers).get("X-CSRF-Token")).toBe("csrf-abc");
      expect(new Headers(fetchInit(1).headers).get("X-CSRF-Token")).toBe("csrf-abc");
    });

    it("GET リクエストには X-CSRF-Token ヘッダーを付与しない", async () => {
      // Arrange
      mockCsrfToken = "csrf-abc";

      // Act
      await apiFetch("/api/todos");

      // Assert
      const headers = new Headers(fetchInit().headers);
      expect(headers.has("X-CSRF-Token")).toBe(false);
    });

    it("トークンがないとき POST でも X-CSRF-Token ヘッダーを付与しない", async () => {
      // Arrange
      mockCsrfToken = null;

      // Act
      await apiFetch("/api/todos", { method: "POST" });

      // Assert
      const headers = new Headers(fetchInit().headers);
      expect(headers.has("X-CSRF-Token")).toBe(false);
    });

    it("既存の init ヘッダーを保持したまま X-CSRF-Token を追加する", async () => {
      // Arrange
      mockCsrfToken = "csrf-abc";

      // Act
      await apiFetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      // Assert
      const headers = new Headers(fetchInit().headers);
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(headers.get("X-CSRF-Token")).toBe("csrf-abc");
    });
  });

  describe("401 ハンドリング", () => {
    it("401 レスポンス時に /api/auth/refresh を試行し、成功時は元のリクエストをリトライする", async () => {
      // Arrange: 1回目の /api/todos が 401、refresh が成功、リトライが 200
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        if (input === "/api/auth/refresh") {
          return new Response(JSON.stringify({ csrf_token: "csrf-new" }), { status: 200 });
        }
        const calls = fetchMock.mock.calls.filter(([i]) => i === "/api/todos").length;
        return new Response("ok", { status: calls <= 1 ? 401 : 200 });
      });
      vi.stubGlobal("fetch", fetchMock);

      // Act
      const response = await apiFetch("/api/todos");

      // Assert
      expect(fetchMock).toHaveBeenCalledTimes(3); // 1回目 /api/todos(401) → refresh(200) → リトライ /api/todos(200)
      expect(response.status).toBe(200);
    });

    it("refresh 成功時、以降のリクエスト用に新しい csrf_token を保持し直す", async () => {
      // Arrange
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        if (input === "/api/auth/refresh") {
          return new Response(JSON.stringify({ csrf_token: "csrf-new" }), { status: 200 });
        }
        const calls = fetchMock.mock.calls.filter(([i]) => i === "/api/todos").length;
        return new Response("ok", { status: calls <= 1 ? 401 : 200 });
      });
      vi.stubGlobal("fetch", fetchMock);

      // Act
      await apiFetch("/api/todos");

      // Assert
      expect(mockSetCsrfToken).toHaveBeenCalledWith("csrf-new");
    });

    it("refresh 失敗時、csrf_token をリセットし /login へリダイレクトする", async () => {
      // Arrange: /api/todos・refresh とも常に 401
      const fetchMock = vi.fn(async () => new Response(null, { status: 401 }));
      vi.stubGlobal("fetch", fetchMock);

      // Act
      await apiFetch("/api/todos");

      // Assert
      expect(mockSetCsrfToken).toHaveBeenCalledWith(null);
      expect(window.location.href).toBe("/login");
    });

    it("/api/auth/login への 401 は refresh を試行せずそのまま返す", async () => {
      // Arrange
      const fetchMock = vi.fn(async () => new Response(null, { status: 401 }));
      vi.stubGlobal("fetch", fetchMock);

      // Act
      const response = await apiFetch("/api/auth/login", { method: "POST" });

      // Assert
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(401);
      expect(window.location.href).toBe("");
    });

    it("/api/auth/signup への 401 は refresh を試行せずそのまま返す", async () => {
      // Arrange
      const fetchMock = vi.fn(async () => new Response(null, { status: 401 }));
      vi.stubGlobal("fetch", fetchMock);

      // Act
      const response = await apiFetch("/api/auth/signup", { method: "POST" });

      // Assert
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(401);
    });

    it("/api/auth/refresh 自身への 401 はさらなる refresh を試行せずそのまま返す", async () => {
      // Arrange
      const fetchMock = vi.fn(async () => new Response(null, { status: 401 }));
      vi.stubGlobal("fetch", fetchMock);

      // Act
      const response = await apiFetch("/api/auth/refresh", { method: "POST" });

      // Assert
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(401);
    });

    it("/api/auth/me への 401 は refresh を試行するが、refresh 失敗時も /login へリダイレクトせず 401 レスポンスをそのまま返す", async () => {
      // Arrange: /api/auth/me・refresh とも常に 401（未ログイン状態の getSession() 呼び出しを再現）
      const fetchMock = vi.fn(async () => new Response(null, { status: 401 }));
      vi.stubGlobal("fetch", fetchMock);

      // Act
      const response = await apiFetch("/api/auth/me");

      // Assert: refresh は試行される（/api/auth/me + /api/auth/refresh の2回）が、
      // 強制遷移は発生せず、元の 401 レスポンスがそのまま返る
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(mockSetCsrfToken).toHaveBeenCalledWith(null);
      expect(window.location.href).toBe("");
      expect(response.status).toBe(401);
    });

    it("401 以外のレスポンス時は refresh もリダイレクトもしない", async () => {
      // Arrange
      vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403 })));

      // Act
      await apiFetch("/api/todos");

      // Assert
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
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
      expect(fetchInput()).toBe("https://api.example.com/api/todos/analyze");
    });

    it("VITE_API_BASE_URL が未設定のとき相対パスのまま fetch する", async () => {
      // Arrange: env 未設定（統合 dev / 段階カットオーバー中を想定）
      vi.stubEnv("VITE_API_BASE_URL", "");

      // Act
      await apiFetch("/api/todos/analyze");

      // Assert
      expect(fetchInput()).toBe("/api/todos/analyze");
    });
  });
});
