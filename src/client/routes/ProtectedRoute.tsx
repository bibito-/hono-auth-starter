import { AuthContext } from "@client/contexts/AuthContext";
import { use } from "react";
import { Navigate, Outlet } from "react-router";
import Spinner from "@client/components/ui/CustomSpinner";

export default function ProtectedRoute() {
    const { authUser: user, loading } = use(AuthContext)

    if (loading) return <Spinner />

    return user ? <Outlet /> : <Navigate to="/login" replace />
}