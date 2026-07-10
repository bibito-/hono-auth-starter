import ConfirmEmail from "@client/components/features/auth/ConfirmEmail";
import ForgotPassword from "@client/components/features/auth/ForgotPassword";
import LoginWithEmail from "@client/components/features/auth/LoginWithEmail";
import ResetPassword from "@client/components/features/auth/ResetPassword";
import SignUp from "@client/components/features/auth/SignUp";
import ContentPage from "@client/components/pages/ContentPage";
import NotFoundPage from "@client/components/pages/NotFoundPage";
import UserManagementPage from "@client/components/pages/UserManagementPage";
import { Route, Routes } from "react-router";
import ProtectedRoute from "./ProtectedRoute";
import RoleProtectedRoute from "./RoleProtectedRoute";

// ルートは eager import する。
// 各ページのチャンクは小さく、遅延ロードの初回削減効果はほぼ無い一方、Suspense フォールバック
// （全画面 PageSkeleton）が認証 loading の Spinner と二重に出てちらつきの原因になるため、
// ルート分割はしない。バンドル軽量化は vite.config の vendor 分割で担う。
const AppRoutes = () => {
  return (
    <Routes>
      {/*
        最初に認証を行ってから、Outletを使用して子コンポーネント(メインコンテンツ)を表示するためのルートを定義
        ルートにアクセスした際、ProtectedRouteコンポーネントが認証状態を確認し、認証されていない場合はLoginコンポーネントを表示する
      */}
      <Route element={<ProtectedRoute />}>
        <Route index element={<ContentPage />} />
        <Route element={<RoleProtectedRoute allowedRoles={["admin", "manager"]} />}>
          <Route path="/users" element={<UserManagementPage />} />
        </Route>
      </Route>
      <Route path="/login" element={<LoginWithEmail />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/auth/reset-password" element={<ResetPassword />} />
      <Route path="/auth/confirm" element={<ConfirmEmail />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default AppRoutes;
