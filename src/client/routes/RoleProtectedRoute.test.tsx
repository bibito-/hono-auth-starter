import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthServiceType } from "../contexts/AuthContext";
import RoleProtectedRoute from "./RoleProtectedRoute";

// react-router の Navigate と Outlet をモックする
vi.mock("react-router", () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
  Outlet: () => <div data-testid="outlet" />,
}));

function renderWithAuth(authValue: Partial<AuthServiceType>, allowedRoles: string[]) {
  const defaultValue: AuthServiceType = {
    authUser: null,
    pendingEmail: null,
    loading: false,
    loginMutation: {} as AuthServiceType["loginMutation"],
    signinMutation: {} as AuthServiceType["signinMutation"],
    logoutMutation: {} as AuthServiceType["logoutMutation"],
    ...authValue,
  };

  return render(
    <AuthContext.Provider value={defaultValue}>
      <RoleProtectedRoute allowedRoles={allowedRoles as import("../entities/UserRole").UserRole[]} />
    </AuthContext.Provider>
  );
}

describe("RoleProtectedRoute", () => {
  it("loading が true のとき Spinner を表示し Navigate を呼ばない", () => {
    // Arrange
    const authValue: Partial<AuthServiceType> = {
      authUser: null,
      loading: true,
    };

    // Render: loading 中の状態でレンダリング
    renderWithAuth(authValue, ["admin"]);

    // Assert
    expect(screen.queryByTestId("navigate")).toBeNull();
    expect(screen.queryByTestId("outlet")).toBeNull();
    // Spinner は div.animate-spin を持つ
    expect(document.querySelector(".animate-spin")).not.toBeNull();
  });

  it("loading が false かつ authUser が null のとき / にリダイレクトする", () => {
    // Arrange
    const authValue: Partial<AuthServiceType> = {
      authUser: null,
      loading: false,
    };

    // Render: 未認証状態でレンダリング
    renderWithAuth(authValue, ["admin"]);

    // Assert
    const navigate = screen.getByTestId("navigate");
    expect(navigate).not.toBeNull();
    expect(navigate.getAttribute("data-to")).toBe("/");
    expect(screen.queryByTestId("outlet")).toBeNull();
  });

  it("loading が false かつ authUser.role が allowedRoles に含まれないとき / にリダイレクトする", () => {
    // Arrange
    const authValue: Partial<AuthServiceType> = {
      authUser: { id: "1", name: "Test", email: "test@example.com", role: "staff", username: null },
      loading: false,
    };

    // Render: allowedRoles に含まれないロールでレンダリング
    renderWithAuth(authValue, ["admin", "manager"]);

    // Assert
    const navigate = screen.getByTestId("navigate");
    expect(navigate).not.toBeNull();
    expect(navigate.getAttribute("data-to")).toBe("/");
    expect(screen.queryByTestId("outlet")).toBeNull();
  });

  it("loading が false かつ authUser.role が allowedRoles に含まれるとき Outlet を描画する", () => {
    // Arrange
    const authValue: Partial<AuthServiceType> = {
      authUser: { id: "1", name: "Test", email: "test@example.com", role: "admin", username: null },
      loading: false,
    };

    // Render: allowedRoles に含まれるロールでレンダリング
    renderWithAuth(authValue, ["admin", "manager"]);

    // Assert
    expect(screen.getByTestId("outlet")).not.toBeNull();
    expect(screen.queryByTestId("navigate")).toBeNull();
  });
});
