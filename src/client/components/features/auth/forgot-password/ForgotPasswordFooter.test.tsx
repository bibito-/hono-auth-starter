import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ForgotPasswordFooter } from "./ForgotPasswordFooter";

describe("ForgotPasswordFooter", () => {
  it("isPending=false のとき Spinner を表示しない", () => {
    // Render: isPending=false でレンダリング
    render(<ForgotPasswordFooter formId="forgot-password-form" isPending={false} />);

    // Assert
    expect(screen.queryByRole("status", { name: "Loading" })).toBeNull();
  });

  it("isPending=true のとき Spinner を表示しボタンを無効化する", () => {
    // Render: isPending=true でレンダリング
    render(<ForgotPasswordFooter formId="forgot-password-form" isPending />);
    // Arrange: 送信ボタンを取得
    const button = screen.getByRole("button", { name: /送信/ });

    // Assert
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("formId を button の form 属性に渡す", () => {
    // Render: formId を指定してレンダリング
    render(<ForgotPasswordFooter formId="forgot-password-form" isPending={false} />);
    // Arrange: 送信ボタンを取得
    const button = screen.getByRole("button", { name: "送信" });

    // Assert
    expect(button.getAttribute("form")).toBe("forgot-password-form");
  });
});
