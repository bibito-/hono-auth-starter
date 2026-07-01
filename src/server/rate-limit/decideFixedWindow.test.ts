// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  decideAccountWindow,
  decideUserWindow,
  type AccountRow,
  type UserRow,
} from "./decideFixedWindow";

const WINDOW_MS = 60_000;
const USER_LIMIT = 10;
const ACCOUNT_LIMIT = 300;

// 2026-06-25 12:00:00 UTC（UTC 正午＝次の 00:00 UTC まで 12h=43200s）
const NOW = Date.UTC(2026, 5, 25, 12, 0, 0);

describe("decideUserWindow", () => {
  it("初回（row なし）: 許可し count=1・window_start=now の nextRow を返す", () => {
    // Arrange: 既存窓なし
    const row: UserRow | null = null;

    // Act
    const result = decideUserWindow(NOW, row, USER_LIMIT, WINDOW_MS);

    // Assert
    expect(result.allowed).toBe(true);
    expect(result.retryAfter).toBe(0);
    expect(result.nextRow).toEqual({ window_start: NOW, count: 1 });
  });

  it("窓内・上限未満: 許可し count を増分する（window_start は維持）", () => {
    // Arrange: 30 秒前に開始した窓で 5 件消費済み
    const start = NOW - 30_000;
    const row: UserRow = { window_start: start, count: 5 };

    // Act
    const result = decideUserWindow(NOW, row, USER_LIMIT, WINDOW_MS);

    // Assert
    expect(result.allowed).toBe(true);
    expect(result.nextRow).toEqual({ window_start: start, count: 6 });
  });

  it("窓内・上限ちょうど: 拒否し増分しない・retryAfter は窓終端までの秒（切り上げ）", () => {
    // Arrange: 30.5 秒前開始・上限ちょうど消費済み（残り 29.5s → ceil=30）
    const start = NOW - 30_500;
    const row: UserRow = { window_start: start, count: USER_LIMIT };

    // Act
    const result = decideUserWindow(NOW, row, USER_LIMIT, WINDOW_MS);

    // Assert
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(30);
  });

  it("窓終了後: 上限到達済みでも窓リセットして許可（count=1・window_start=now）", () => {
    // Arrange: 60 秒以上前に開始・上限超過の古い窓
    const row: UserRow = { window_start: NOW - WINDOW_MS, count: 99 };

    // Act
    const result = decideUserWindow(NOW, row, USER_LIMIT, WINDOW_MS);

    // Assert
    expect(result.allowed).toBe(true);
    expect(result.nextRow).toEqual({ window_start: NOW, count: 1 });
  });
});

describe("decideAccountWindow", () => {
  it("初回（row なし）: 許可し day=今日(UTC)・count=1 の nextRow を返す", () => {
    // Arrange: 既存窓なし
    const row: AccountRow | null = null;

    // Act
    const result = decideAccountWindow(NOW, row, ACCOUNT_LIMIT);

    // Assert
    expect(result.allowed).toBe(true);
    expect(result.nextRow).toEqual({ day: "2026-06-25", count: 1 });
  });

  it("同日・上限未満: 許可し count を増分する", () => {
    // Arrange: 今日 100 件消費済み
    const row: AccountRow = { day: "2026-06-25", count: 100 };

    // Act
    const result = decideAccountWindow(NOW, row, ACCOUNT_LIMIT);

    // Assert
    expect(result.allowed).toBe(true);
    expect(result.nextRow).toEqual({ day: "2026-06-25", count: 101 });
  });

  it("同日・上限ちょうど: 拒否し増分しない・retryAfter は次の 00:00 UTC までの秒", () => {
    // Arrange: 今日が上限ちょうど（正午 → 残り 12h=43200s）
    const row: AccountRow = { day: "2026-06-25", count: ACCOUNT_LIMIT };

    // Act
    const result = decideAccountWindow(NOW, row, ACCOUNT_LIMIT);

    // Assert
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(43_200);
  });

  it("別日（UTC 日跨ぎ）: 上限超過済みでもリセットして許可（count=1）", () => {
    // Arrange: 前日の上限超過カウント
    const row: AccountRow = { day: "2026-06-24", count: 9999 };

    // Act
    const result = decideAccountWindow(NOW, row, ACCOUNT_LIMIT);

    // Assert
    expect(result.allowed).toBe(true);
    expect(result.nextRow).toEqual({ day: "2026-06-25", count: 1 });
  });
});
