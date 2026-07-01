import type { AuthError, AuthErrorCode } from "@client/entities/AuthErrors";
import { showErrorToast } from "@client/utils/toastHelpers";
import type { ReactNode } from "react";
import { useState } from "react";
import { AuthErrorContext } from "./AuthErrorContext";

const codeToMessage: Record<
  AuthErrorCode,
  { title: string; description: string }
> = {
  FAIL_LOGIN: {
    title: "ログイン失敗",
    description: "メールアドレスまたはパスワードが正しくありません",
  },
  FAIL_CREATE_ACCOUNT: {
    title: "アカウント作成失敗",
    description: "この組み合わせは登録できません",
  },
};

type Props = {
  children: ReactNode;
};

/**
 * 認証時に発生したエラーをハンドリングするプロバイダー
 * 異常系でUI上に表示させたいものを管理するのはここで
 */
const AuthErrorProvider = ({ children }: Props) => {
  const [authError, setAuthError] = useState<AuthError | null>(null);

  const handleError = (error: AuthError) => {
    setAuthError(error);
    const { title, description } = codeToMessage[error.code];
    showErrorToast(title, description);
  };
  return (
    <AuthErrorContext.Provider value={{ authError, handleError }}>
      {children}
    </AuthErrorContext.Provider>
  );
};

export default AuthErrorProvider;
