import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useTokenHashParam } from "./useTokenHashParam";

function setLocation(pathAndQuery: string) {
  window.history.pushState({}, "", pathAndQuery);
}

describe("useTokenHashParam", () => {
  beforeEach(() => {
    setLocation("/");
  });

  it("token_hash がクエリにあるとき値を返す", () => {
    // 準備: token_hash 付きの URL にしてから hook を初期化
    setLocation("/auth/reset-password?token_hash=abc123&type=recovery");
    const { result } = renderHook(() => useTokenHashParam());

    // Assert
    expect(result.current).toBe("abc123");
  });

  it("token_hash がクエリにあるとき history.replaceState でクエリを除去する", () => {
    // 準備: token_hash 付きの URL にしてから hook を初期化
    setLocation("/auth/reset-password?token_hash=abc123&type=recovery");
    renderHook(() => useTokenHashParam());

    // Assert
    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/auth/reset-password");
  });

  it("token_hash がクエリに無いとき null を返す", () => {
    // 準備: クエリなしの URL にしてから hook を初期化
    setLocation("/auth/reset-password");
    const { result } = renderHook(() => useTokenHashParam());

    // Assert
    expect(result.current).toBeNull();
  });

  it("再レンダーしても最初に読み取った値を保持する", () => {
    // 準備: token_hash 付きの URL にしてから hook を初期化
    setLocation("/auth/reset-password?token_hash=abc123");
    const { result, rerender } = renderHook(() => useTokenHashParam());

    // Arrange: 初回の返り値を控える
    const firstValue = result.current;

    // Act
    rerender();

    // Assert
    expect(result.current).toBe(firstValue);
    expect(result.current).toBe("abc123");
  });
});
