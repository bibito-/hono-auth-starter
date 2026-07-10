import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { LoginFooter } from "./LoginFooter";

function renderLoginFooter(isPending: boolean) {
  return render(
    <MemoryRouter>
      <LoginFooter formId="login-form" isPending={isPending} />
    </MemoryRouter>
  );
}

describe("LoginFooter", () => {
  it("トークンベースの default variant でボタンを描画する（ブランド色の login variant は使わない）", () => {
    // Render: isPending=false でレンダリング
    renderLoginFooter(false);
    // Arrange: ログインボタンを取得
    const button = screen.getByRole("button", { name: "ログイン" });

    // Assert
    expect(button.getAttribute("data-variant")).toBe("default");
  });

  it("isPending=false のとき Spinner を表示しない", () => {
    // Render: isPending=false でレンダリング
    renderLoginFooter(false);

    // Assert
    expect(screen.queryByRole("status", { name: "Loading" })).toBeNull();
  });

  it("isPending=true のとき Spinner を表示しボタンを無効化する", () => {
    // Render: isPending=true でレンダリング
    renderLoginFooter(true);
    // Arrange: ログインボタンを取得
    const button = screen.getByRole("button", { name: /ログイン/ });

    // Assert
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("formId を button の form 属性に渡す", () => {
    // Render: formId を指定してレンダリング
    renderLoginFooter(false);
    // Arrange: ログインボタンを取得
    const button = screen.getByRole("button", { name: "ログイン" });

    // Assert
    expect(button.getAttribute("form")).toBe("login-form");
  });

  it("パスワードを忘れた場合のリンクを /forgot-password へ張る", () => {
    // Render: isPending=false でレンダリング
    renderLoginFooter(false);
    // Arrange: リンクを取得
    const link = screen.getByRole("link", { name: "パスワードを忘れた場合" });

    // Assert
    expect(link.getAttribute("href")).toBe("/forgot-password");
  });
});
