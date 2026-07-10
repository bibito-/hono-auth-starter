import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthServiceType } from "@client/contexts/AuthContext";
import { ResendConfirmationForm } from "./ResendConfirmationForm";

const mockResendMutate = vi.fn();

function renderForm(isPending = false) {
  const mockAuthContext = {
    resendConfirmationMutation: { mutate: mockResendMutate, isPending },
  } as unknown as AuthServiceType;

  return render(
    <AuthContext.Provider value={mockAuthContext}>
      <ResendConfirmationForm />
    </AuthContext.Provider>
  );
}

describe("ResendConfirmationForm", () => {
  beforeEach(() => {
    mockResendMutate.mockClear();
  });

  it("有効なメールアドレスを送信すると resendConfirmationMutation.mutate を email 付きで呼ぶ", async () => {
    // Render: フォームをレンダリング
    renderForm();
    // Arrange: 入力欄と送信ボタンを取得
    const input = screen.getByLabelText("メールアドレス");
    const button = screen.getByRole("button", { name: "確認メールを再送信" });

    // Act
    fireEvent.change(input, { target: { value: "user@example.com" } });
    fireEvent.click(button);

    // Assert
    await waitFor(() => {
      expect(mockResendMutate).toHaveBeenCalledWith({ email: "user@example.com" });
    });
  });

  it("メールアドレスの形式が不正なとき resendConfirmationMutation.mutate を呼ばない", async () => {
    // Render: フォームをレンダリング
    renderForm();
    // Arrange: 入力欄と送信ボタンを取得
    const input = screen.getByLabelText("メールアドレス");
    const button = screen.getByRole("button", { name: "確認メールを再送信" });

    // Act
    fireEvent.change(input, { target: { value: "not-an-email" } });
    fireEvent.click(button);

    // Assert
    await waitFor(() => {
      expect(screen.getByText("メールアドレスの形式で入力してください")).not.toBeNull();
    });
    expect(mockResendMutate).not.toHaveBeenCalled();
  });

  it("isPending=true のとき Spinner を表示しボタンを無効化する", () => {
    // Render: isPending=true でレンダリング
    renderForm(true);
    // Arrange: 送信ボタンを取得
    const button = screen.getByRole("button", { name: /確認メールを再送信/ });

    // Assert
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
    expect(button.hasAttribute("disabled")).toBe(true);
  });
});
