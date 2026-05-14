import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useElectionData } from './hooks/useElectionData';
import { useTheme } from './hooks/useTheme';
import Admin from './pages/Admin';
import Apply from './pages/Apply';
import Dashboard from './pages/Dashboard';
import ElectionHistory from './pages/ElectionHistory';
import ForgotPassword from './pages/ForgotPassword';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ProtectedRoute from './components/ProtectedRoute';
import Results from './pages/Results';
import VerifyReceipt from './pages/VerifyReceipt';
import VotePage from './pages/Vote';
import { isAdminRole, normalizeRole } from './services/roles';

function candidateApplicationsOpen(election) {
  const status = String(election?.status || 'inactive').toLowerCase();
  return ['inactive', 'standby'].includes(status) && election?.candidate_applications_open !== false;
}

function ApplyLockedNotice() {
  return (
    <section className="mx-auto max-w-2xl py-16 text-center">
      <div className="card p-8">
        <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Candidate application</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight">Applications Closed</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">Candidate applications are closed during active elections.</p>
      </div>
    </section>
  );
}

function ApplyRoute({ data }) {
  if (!data.loading && !candidateApplicationsOpen(data.election)) return <ApplyLockedNotice />;
  return <Apply data={data} />;
}

function HomeRoute({ data }) {
  const { profile, loading } = useAuth();
  if (loading) return <Home data={data} />;
  if (isAdminRole(profile?.role)) return <Navigate to="/dashboard" replace />;
  if (normalizeRole(profile?.role) === 'voter') return <Navigate to="/dashboard" replace />;
  return <Home data={data} />;
}

function LoginRoute() {
  const { profile, loading } = useAuth();
  if (loading) return <Login />;
  if (isAdminRole(profile?.role)) return <Navigate to="/dashboard" replace />;
  if (normalizeRole(profile?.role) === 'voter') return <Navigate to="/dashboard" replace />;
  return <Login />;
}

function RegisterRoute() {
  const { profile, loading } = useAuth();
  if (loading) return <Register />;
  if (isAdminRole(profile?.role)) return <Navigate to="/dashboard" replace />;
  if (normalizeRole(profile?.role) === 'voter') return <Navigate to="/dashboard" replace />;
  return <Register />;
}

function ForgotPasswordRoute() {
  const { profile, loading } = useAuth();
  if (loading) return <ForgotPassword />;
  if (isAdminRole(profile?.role)) return <Navigate to="/dashboard" replace />;
  if (normalizeRole(profile?.role) === 'voter') return <Navigate to="/dashboard" replace />;
  return <ForgotPassword />;
}

function DashboardRoute({ data }) {
  const { profile, loading } = useAuth();
  if (loading) return <div className="mx-auto max-w-7xl px-4 py-10 text-sm text-slate-500">Loading account...</div>;
  if (!profile) return <Navigate to="/login" replace />;
  if (normalizeRole(profile.role) !== 'voter' && !isAdminRole(profile.role)) return <Navigate to="/login" replace />;
  return <Dashboard data={data} />;
}

function ResultsRoute({ data }) {
  const { profile, voter, loading } = useAuth();
  if (!loading && normalizeRole(profile?.role) === 'voter' && (voter?.must_change_password || voter?.password_is_default)) return <Navigate to="/dashboard" replace />;
  return <Results data={data} />;
}

function VerifyRoute({ data }) {
  const { profile, voter, loading } = useAuth();
  if (!loading && normalizeRole(profile?.role) === 'voter' && (voter?.must_change_password || voter?.password_is_default)) return <Navigate to="/dashboard" replace />;
  return <VerifyReceipt data={data} />;
}

function NotFoundRoute() {
  const location = useLocation();
  return (
    <section className="mx-auto max-w-2xl py-16">
      <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Page not found</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight">This route does not exist.</h1>
      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{location.pathname}</p>
    </section>
  );
}

function AppShell() {
  const theme = useTheme();
  const electionData = useElectionData();
  const { profile } = useAuth();

  useEffect(() => {
    if (profile) electionData.refresh();
  }, [profile?.role, profile?.full_name, electionData.refresh]);

  return (
    <div className="page-shell">
      <Navbar election={electionData.election} theme={theme.theme} onToggleTheme={theme.toggleTheme} />
      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        <Routes>
          <Route path="/" element={<HomeRoute data={electionData} />} />
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/forgot-password" element={<ForgotPasswordRoute />} />
          <Route path="/register" element={<RegisterRoute />} />
          <Route path="/dashboard" element={<DashboardRoute data={electionData} />} />
          <Route path="/results" element={<ResultsRoute data={electionData} />} />
          <Route path="/verify" element={<VerifyRoute data={electionData} />} />
          <Route path="/apply" element={<ApplyRoute data={electionData} />} />
          <Route path="/vote" element={<ProtectedRoute><VotePage data={electionData} /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute admin><Admin data={electionData} /></ProtectedRoute>} />
          <Route path="/history" element={<ProtectedRoute admin><ElectionHistory /></ProtectedRoute>} />
          <Route path="*" element={<NotFoundRoute />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
