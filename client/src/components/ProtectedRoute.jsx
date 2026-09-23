import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Frontend gate is purely for UX (don't show a Boardman screen to a
// Better) — the real permission check always happens again on the server,
// per the security architecture in docs/ARCHITECTURE.md section 11.
export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="page-loading">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;

  return children;
}
