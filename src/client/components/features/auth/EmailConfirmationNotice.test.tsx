import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthServiceType } from "@client/contexts/AuthContext";
import { EmailConfirmationNotice } from "./EmailConfirmationNotice";

const mockResendMutate = vi.fn();

function renderNotice(isPending = false) {
  const mockAuthContext = {
    resendConfirmationMutation: { mutate: mockResendMutate, isPending },
  } as unknown as AuthServiceType;

  return render(
    <AuthContext.Provider value={mockAuthContext}>
      <EmailConfirmationNotice email="user@example.com" />
    </AuthContext.Provider>
  );
}

describe("EmailConfirmationNotice", () => {
  beforeEach(() => {
    mockResendMutate.mockClear();
  });

  it("email をメッセージ内に表示する", () => {
    // Render: isPending=false でレンダリング
    renderNotice();

    // Assert
    expect(screen.getByText("user@example.com")).not.toBeNull();
  });

  it("再送信ボタンをクリックすると resendConfirmationMutation.mutate を email 付きで呼ぶ", () => {
    // Render: isPending=false でレンダリング
    renderNotice();
    // Arrange: 再送信ボタンを取得
    const button = screen.getByRole("button", { name: /確認メールを再送信/ });

    // Act
    fireEvent.click(button);

    // Assert
    expect(mockResendMutate).toHaveBeenCalledWith({ email: "user@example.com" });
  });

  it("isPending=false のとき Spinner を表示しない", () => {
    // Render: isPending=false でレンダリング
    renderNotice(false);

    // Assert
    expect(screen.queryByRole("status", { name: "Loading" })).toBeNull();
  });

  it("isPending=true のとき Spinner を表示しボタンを無効化する", () => {
    // Render: isPending=true でレンダリング
    renderNotice(true);
    // Arrange: 再送信ボタンを取得
    const button = screen.getByRole("button", { name: /確認メールを再送信/ });

    // Assert
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
    expect(button.hasAttribute("disabled")).toBe(true);
  });
});
