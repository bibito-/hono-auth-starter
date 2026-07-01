import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import NotFoundPage from "./NotFoundPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <NotFoundPage />
    </MemoryRouter>
  );
}

describe("NotFoundPage", () => {
  it("外側コンテナにライト用背景とダーク用背景の className が両方含まれる", () => {
    // Render: レンダリング
    const { container } = renderPage();
    // Arrange: 外側コンテナを取得
    const outerContainer = container.firstElementChild as HTMLElement;

    // Assert
    expect(outerContainer.className).toContain("bg-[oklch(0.955_0_0)]");
    expect(outerContainer.className).toContain("dark:bg-background");
  });

  it("「404」装飾文字にライト用文字色とダーク用文字色の className が両方含まれる", () => {
    // Render: レンダリング
    renderPage();
    // Arrange: 「404」装飾文字を取得
    const decorativeText = screen.getByText("404");

    // Assert
    expect(decorativeText.className).toContain("text-[oklch(0.87_0_0)]");
    expect(decorativeText.className).toContain("dark:text-[oklch(0.24_0_0)]");
  });

  it("見出し・サブテキスト・CTAリンクが変わらず表示される", () => {
    // Render: レンダリング
    renderPage();

    // Assert
    expect(screen.getByRole("heading", { name: "ページが見つかりません" })).not.toBeNull();
    expect(
      screen.getByText("お探しのページは移動または削除された可能性があります。URL をご確認のうえ、もう一度お試しください。")
    ).not.toBeNull();
    const ctaLink = screen.getByRole("link", { name: "トップへ戻る" });
    expect(ctaLink.getAttribute("href")).toBe("/");
  });
});
