import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResetPasswordFooter } from "./ResetPasswordFooter";

describe("ResetPasswordFooter", () => {
  it("isPending=false のとき Spinner を表示しない", () => {
    // Render: isPending=false でレンダリング
    render(<ResetPasswordFooter formId="reset-password-form" isPending={false} />);

    // Assert
    expect(screen.queryByRole("status", { name: "Loading" })).toBeNull();
  });

  it("isPending=true のとき Spinner を表示しボタンを無効化する", () => {
    // Render: isPending=true でレンダリング
    render(<ResetPasswordFooter formId="reset-password-form" isPending />);
    // Arrange: 変更するボタンを取得
    const button = screen.getByRole("button", { name: /変更する/ });

    // Assert
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("formId を button の form 属性に渡す", () => {
    // Render: formId を指定してレンダリング
    render(<ResetPasswordFooter formId="reset-password-form" isPending={false} />);
    // Arrange: 変更するボタンを取得
    const button = screen.getByRole("button", { name: "変更する" });

    // Assert
    expect(button.getAttribute("form")).toBe("reset-password-form");
  });
});
