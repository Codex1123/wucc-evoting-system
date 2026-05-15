import { Link, NavLink } from 'react-router-dom';
import { Archive, BarChart3, FileSearch, LayoutDashboard, LogIn, LogOut, Moon, Sun, UserRoundCheck, Vote } from 'lucide-react';
import Logo from './Logo';
import { useAuth } from '../context/AuthContext';
import { isAdminRole, normalizeRole } from '../services/roles';
import { getElectionPhase } from '../utils/electionTiming';

const navClass = ({ isActive }) =>
  `inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${
    isActive
      ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'
  }`;

export default function Navbar({ election, theme, onToggleTheme }) {
  const { profile, voter, logout } = useAuth();
  const active = getElectionPhase(election) === 'active';
  const role = normalizeRole(profile?.role);
  const admin = isAdminRole(role);
  const isVoter = role === 'voter';
  const approvedVoter = isVoter && String(voter?.status || '').toLowerCase() === 'approved';
  const mustChangePassword = isVoter && Boolean(voter?.must_change_password || voter?.password_is_default);
  const showResults = !isVoter || (approvedVoter && !mustChangePassword);
  const voterNav = isVoter && approvedVoter;
  const electionStatus = String(election?.status || 'inactive').toLowerCase();
  const applicationsOpen = ['inactive', 'standby'].includes(electionStatus) && election?.candidate_applications_open !== false;
  return (
    <header className="sticky top-0 z-30 w-full max-w-full overflow-hidden border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="navbar-shell mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 overflow-hidden px-4 py-3 lg:px-6">
        <Link className="navbar-logo min-w-0 shrink-0" to="/"><Logo /></Link>
        <nav className="navbar-nav flex min-w-0 flex-1 max-w-full flex-wrap items-center gap-1 overflow-hidden lg:flex-none" aria-label="Primary navigation">
          {!profile && <NavLink className={navClass} to="/"><LayoutDashboard size={17} />Home</NavLink>}
          {admin && <NavLink className={navClass} to="/dashboard"><LayoutDashboard size={17} />Dashboard</NavLink>}
          {voterNav && <NavLink className={navClass} to="/dashboard"><LayoutDashboard size={17} />Dashboard</NavLink>}
          {voterNav && !mustChangePassword && <NavLink className={navClass} to="/vote"><Vote size={17} />Vote</NavLink>}
          {showResults && <NavLink className={navClass} to="/results"><BarChart3 size={17} />Results</NavLink>}
          {admin && <NavLink className={navClass} to="/history"><Archive size={17} />History</NavLink>}
          {(!admin && (!profile || (approvedVoter && !mustChangePassword))) && <NavLink className={navClass} to="/verify"><FileSearch size={17} />Verify</NavLink>}
          {!profile && applicationsOpen && <NavLink className={({ isActive }) => `${navClass({ isActive })} mobile-auth-link`} to="/apply"><UserRoundCheck size={17} />Apply</NavLink>}
          {!profile && <NavLink className={({ isActive }) => `${navClass({ isActive })} mobile-auth-link`} to="/login"><LogIn size={17} />Login</NavLink>}
          {['superadmin', 'commissioner'].includes(role) && <NavLink className={navClass} to="/admin"><UserRoundCheck size={17} />Admin</NavLink>}
        </nav>
        <div className="navbar-actions flex min-w-0 shrink-0 items-center gap-2">
          <span className={`badge ${active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
            <span className={`h-2 w-2 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            {active ? 'Active' : 'Inactive'}
          </span>
          {!profile && (
            <span className={`badge ${applicationsOpen ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
              {applicationsOpen ? 'Applications Open' : 'Applications Closed'}
            </span>
          )}
          <button className="btn-secondary px-3" onClick={onToggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          {profile ? (
            <button className="btn-secondary px-3" onClick={logout} aria-label="Sign out"><LogOut size={17} /></button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
