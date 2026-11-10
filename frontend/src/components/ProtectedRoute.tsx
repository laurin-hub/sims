import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

/**
 * Schuetzt Router-Töchter: ohne Sitzung geht es zur Login-Seite,
 * ohne Admin-Rolle (bei requireAdmin) zurueck zum Dashboard.
 */
export default function ProtectedRoute({
  requireAdmin = false
}: {
  requireAdmin?: boolean;
}): JSX.Element {
  const { isAuthenticated, isAdmin } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
