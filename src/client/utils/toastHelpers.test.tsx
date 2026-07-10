import { beforeEach, describe, expect, it, vi } from "vitest";

const mockToastWarning = vi.fn();
const mockToastDismiss = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    warning: mockToastWarning,
    dismiss: mockToastDismiss,
    success: mockToastSuccess,
  },
}));

// モック確定後に import する
const { showRateLimitToast, formatRetryAfter, showSuccessToast } = await import("./toastHelpers");

describe("formatRetryAfter", () => {
  it("時間と分があるとき「約X時間Y分」を返す", () => {
    // Act
    const result = formatRetryAfter(7320);

    // Assert
    expect(result).toBe("約2時間2分");
  });

  it("ちょうど時間のとき「約X時間」を返す（分ゼロを省く）", () => {
    // Act
    const result = formatRetryAfter(7200);

    // Assert
    expect(result).toBe("約2時間");
  });

  it("1時間未満のとき「約X分」を返す", () => {
    // Act
    const result = formatRetryAfter(300);

    // Assert
    expect(result).toBe("約5分");
  });

  it("端数の秒は分に切り上げる", () => {
    // 61秒 → ceil(61/60)=2分
    // Act
    const result = formatRetryAfter(61);

    // Assert
    expect(result).toBe("約2分");
  });
});

describe("showSuccessToast", () => {
  beforeEach(() => {
    mockToastSuccess.mockClear();
  });

  it("title と description で toast.success を呼ぶ", () => {
    // Act
    showSuccessToast("確認メールを再送信しました");

    // Assert
    expect(mockToastSuccess).toHaveBeenCalledWith("確認メールを再送信しました", {
      description: undefined,
    });
  });
});

describe("showRateLimitToast", () => {
  beforeEach(() => {
    mockToastWarning.mockClear();
  });

  describe("account scope", () => {
    it("duration: Infinity と id: 'rate-limit-account' で Toast を呼ぶ", () => {
      // Act
      showRateLimitToast("account", 7200);

      // Assert
      expect(mockToastWarning).toHaveBeenCalledWith(
        "本日の AI タグ付け上限に達しました",
        expect.objectContaining({
          id: "rate-limit-account",
          duration: Infinity,
        }),
      );
    });

    it("description に残り時間が含まれる", () => {
      // Act
      showRateLimitToast("account", 7200);

      // Assert
      const opts = mockToastWarning.mock.calls[0][1] as { description: string };
      expect(opts.description).toContain("約2時間");
    });
  });

  describe("user scope", () => {
    it("retryAfter 秒を description に含む Toast を呼ぶ", () => {
      // Act
      showRateLimitToast("user", 30);

      // Assert
      expect(mockToastWarning).toHaveBeenCalledWith(
        "タグ付けの回数制限に達しました",
        expect.objectContaining({ description: expect.stringContaining("30") }),
      );
    });

    it("id: 'rate-limit-account' を設定しない", () => {
      // Act
      showRateLimitToast("user", 30);

      // Assert
      const opts = mockToastWarning.mock.calls[0][1] as Record<string, unknown>;
      expect(opts.id).toBeUndefined();
    });
  });
});
