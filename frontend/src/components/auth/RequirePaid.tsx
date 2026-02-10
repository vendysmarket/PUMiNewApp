import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function RequirePaid() {
  const { hasPaidAccess, isReady } = useAuth();

  if (!isReady) {
    return null;
  }

  if (!hasPaidAccess) {
    return <Navigate to="/app/chat" replace />;
  }

  return <Outlet />;
}
