import { AuthContext } from "@client/contexts/AuthContext";
import type { UserRole } from "@client/entities/UserRole";
import { use } from "react";
import { Navigate, Outlet } from "react-router";
import Spinner from "@client/components/ui/CustomSpinner";

interface RoleProtectedRouteProps {
  allowedRoles: UserRole[];
}

export default function RoleProtectedRoute({ allowedRoles }: RoleProtectedRouteProps) {
  const { authUser, loading } = use(AuthContext);

  if (loading) return <Spinner />;

  if (!authUser?.role || !allowedRoles.includes(authUser.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
