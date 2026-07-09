import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthServiceType } from "@client/contexts/AuthContext";
import { ConfirmEmail } from "./ConfirmEmail";

const mockUseTokenHashParam = vi.fn();
vi.mock("@client/hooks/useTokenHashParam", () => ({
  useTokenHashParam: () => mockUseTokenHashParam(),
}));

const mockVerifyEmailMutate = vi.fn();
const mockResendMutate = vi.fn();

function renderPage(
  opts: {
    tokenHash?: string | null;
    isPending?: boolean;
    isSuccess?: boolean;
    isError?: boolean;
    data?: unknown;
  } = {}
) {
  const {
    tokenHash = "token-abc",
    isPending = false,
    isSuccess = false,
    isError = false,
    data,
  } = opts;
  mockUseTokenHashParam.mockReturnValue(tokenHash);

  const mockAuthContext = {
    verifyEmailMutation: {
      mutate: mockVerifyEmailMutate,
      isPending,
      isSuccess,
      isError,
      data,
    },
    resendConfirmationMutation: {
      mutate: mockResendMutate,
      isPending: false,
    },
  } as unknown as AuthServiceType;

  return render(
    <MemoryRouter initialEntries={["/auth/confirm"]}>
      <AuthContext.Provider value={mockAuthContext}>
        <Routes>
          <Route path="/auth/confirm" element={<ConfirmEmail />} />
          <Route path="/todos" element={<div>Todos Page</div>} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

describe("ConfirmEmail", () => {
  beforeEach(() => {
    mockVerifyEmailMutate.mockClear();
    mockResendMutate.mockClear();
    mockUseTokenHashParam.mockReset();
  });

  it("token_hash があるときマウント時に verifyEmailMutation.mutate を1回呼ぶ", () => {
    // Render: token_hash ありでレンダリング
    renderPage();

    // Assert
    expect(mockVerifyEmailMutate).toHaveBeenCalledTimes(1);
    expect(mockVerifyEmailMutate).toHaveBeenCalledWith({ tokenHash: "token-abc" });
  });

  it("token_hash が無いとき verifyEmailMutation.mutate を呼ばずエラー文言と再送フォームを表示する", () => {
    // Render: token_hash なしでレンダリング
    renderPage({ tokenHash: null });

    // Assert
    expect(mockVerifyEmailMutate).not.toHaveBeenCalled();
    expect(screen.getByText("メールアドレスの確認に失敗しました")).not.toBeNull();
    expect(screen.getByLabelText("メールアドレス")).not.toBeNull();
  });

  it("確認中は Spinner を表示する", () => {
    // Render: isPending=true でレンダリング
    renderPage({ isPending: true });

    // Assert
    expect(screen.getByText("メールアドレスを確認しています…")).not.toBeNull();
  });

  it("verified のとき /todos へ遷移する", async () => {
    // Render: isSuccess=true, status=verified でレンダリング
    renderPage({
      isSuccess: true,
      data: { status: "verified", user: { id: "user-1" } },
    });

    // Assert
    await waitFor(() => {
      expect(screen.getByText("Todos Page")).not.toBeNull();
    });
  });

  it("failure のときエラー文言と再送フォームを表示する", () => {
    // Render: isSuccess=true, status=failure でレンダリング
    renderPage({
      isSuccess: true,
      data: { status: "failure", error: "invalid_or_expired_token" },
    });

    // Assert
    expect(screen.getByText("メールアドレスの確認に失敗しました")).not.toBeNull();
    expect(screen.getByLabelText("メールアドレス")).not.toBeNull();
  });

  it("通信例外（isError）のとき確認中 Spinner から抜けエラー文言と再送フォームを表示する", () => {
    // Render: isError=true でレンダリング（apiFetch 自体が reject したケース）
    renderPage({ isError: true });

    // Assert
    expect(screen.queryByText("メールアドレスを確認しています…")).toBeNull();
    expect(screen.getByText("メールアドレスの確認に失敗しました")).not.toBeNull();
    expect(screen.getByLabelText("メールアドレス")).not.toBeNull();
  });
});
