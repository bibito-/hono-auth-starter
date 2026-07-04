// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchUserProfile } from "./fetchUserProfile";

// requireRole と同じチェーン: from("profiles").select("role, username").eq("id", userId).single()
function createSupabaseMock(result: { data: unknown; error: unknown }) {
  const singleMock = vi.fn(() => Promise.resolve(result));
  const eqMock = vi.fn(() => ({ single: singleMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  return {
    supabase: { from: fromMock } as unknown as SupabaseClient,
    fromMock,
    selectMock,
    eqMock,
    singleMock,
  };
}

describe("fetchUserProfile", () => {
  it("正常系: role・username を取得して返す", async () => {
    // 準備
    const { supabase, fromMock, selectMock, eqMock } = createSupabaseMock({
      data: { role: "staff", username: "taro" },
      error: null,
    });

    // Act
    const result = await fetchUserProfile(supabase, "user-1");

    // Assert
    expect(result).toEqual({ role: "staff", username: "taro" });
    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(selectMock).toHaveBeenCalledWith("role, username");
    expect(eqMock).toHaveBeenCalledWith("id", "user-1");
  });

  it("異常系: エラーのとき role・username とも null にフォールバックする", async () => {
    // 準備
    const { supabase } = createSupabaseMock({
      data: null,
      error: { message: "boom" },
    });

    // Act
    const result = await fetchUserProfile(supabase, "user-1");

    // Assert
    expect(result).toEqual({ role: null, username: null });
  });

  it("異常系: 行が存在しない（data null・error null）とき role・username とも null", async () => {
    // 準備
    const { supabase } = createSupabaseMock({ data: null, error: null });

    // Act
    const result = await fetchUserProfile(supabase, "user-1");

    // Assert
    expect(result).toEqual({ role: null, username: null });
  });

  it("正常系: username が null のときそのまま null を返す", async () => {
    // 準備
    const { supabase } = createSupabaseMock({
      data: { role: "admin", username: null },
      error: null,
    });

    // Act
    const result = await fetchUserProfile(supabase, "user-1");

    // Assert
    expect(result).toEqual({ role: "admin", username: null });
  });
});
