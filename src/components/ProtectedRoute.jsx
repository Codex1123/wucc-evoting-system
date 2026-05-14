import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isAdminRole, normalizeRole } from '../services/roles';

export default function ProtectedRoute({ children, admin = false, allowObserver = false }) {
  const { profile, voter, loading } = useAuth();
  if (loading) return <div className="mx-auto max-w-7xl px-4 py-10 text-sm text-slate-500">Loading account...</div>;
  if (!profile) return <Navigate to="/login" replace />;
  const role = normalizeRole(profile.role);
  if (admin && !isAdminRole(role)) return <Navigate to="/dashboard" replace />;
  if (admin && role === 'observer') return <Navigate to="/dashboard" replace />;
  if (!admin && normalizeRole(profile.role) !== 'voter' && !(allowObserver && isAdminRole(profile.role))) return <Navigate to="/login" replace />;
  if (!admin && role === 'voter' && String(voter?.status || '').toLowerCase() !== 'approved') return <Navigate to="/dashboard" replace />;
  if (!admin && role === 'voter' && (voter?.must_change_password || voter?.password_is_default)) return <Navigate to="/dashboard" replace />;
  return children;
}
