import type { AuthService } from "@client/services/AuthService";
import type { ReactNode } from "react";
import AuthErrorProvider from "./AuthErrorProvider";
import AuthServiceProvider from "./AuthServiceProvider";

/**
 * 認証系のエラーをまとめるクラス
 */
export type Props = {
  children: ReactNode;
  authService: AuthService;
};

const AuthProvider = ({ children, authService }: Props) => {
  return (
    <AuthErrorProvider>
      <AuthServiceProvider authService={authService}>
        {children}
      </AuthServiceProvider>
    </AuthErrorProvider>
  );
};

export default AuthProvider;
