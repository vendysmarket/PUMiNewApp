import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

/**
 * Route guard that requires authentication.
 * Redirects unauthenticated users to /home.
 */
export function RequireAuth() {
  const { isLoggedIn, isReady } = useAuth();

  // Show nothing while auth state is loading
  if (!isReady) {
    return null;
  }

  // Redirect to /home if not authenticated
  if (!isLoggedIn) {
    return <Navigate to="/home" replace />;
  }

  return <Outlet />;
}
