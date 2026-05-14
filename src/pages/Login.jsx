import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, LogIn, Mail, ShieldCheck, Vote } from 'lucide-react';
import Logo from '../components/Logo';
import StatusMessage from '../components/StatusMessage';
import { useAuth } from '../context/AuthContext';
import { signInAdmin, signInVoter } from '../services/electionService';
import { isAdminRole } from '../services/roles';

export default function Login() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [mode, setMode] = useState('voter');
  const [voterForm, setVoterForm] = useState({ email: '', password: '' });
  const [adminForm, setAdminForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const form = mode === 'admin' ? adminForm : voterForm;

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (mode === 'admin') {
        const result = await signInAdmin(adminForm.email, adminForm.password);
        console.log('[auth] admin login result', result);
        console.log('[auth] admin login user id', result.user?.id);
        console.log('[auth] admin login profile result', result.profile);
        console.log('[auth] admin login role', result.profile?.role);
        auth.setProfile(result.profile);
        auth.setVoter(null);
        navigate(result.profile?.role === 'observer' ? '/dashboard' : '/admin', { replace: true });
        return;
      }

      const result = await signInVoter(voterForm.email, voterForm.password);
      console.log('[auth] login result', result);
      console.log('[auth] login user id', result.user?.id);
      console.log('[auth] login profile result', result.profile);
      console.log('[auth] login role', result.profile?.role);
      auth.setProfile(result.profile);
      auth.setVoter(result.voter || null);
      navigate(isAdminRole(result.profile.role) ? '/admin' : '/dashboard', { replace: true });
    } catch (err) {
      console.error('[auth] login failed', err);
      setError(err?.message || err?.error_description || 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }

  function switchMode(nextMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setError('');
    setShowPassword(false);
    if (nextMode === 'admin') {
      setAdminForm({ email: '', password: '' });
      return;
    }
    setVoterForm({ email: '', password: '' });
  }

  function updateCurrentForm(field, value) {
    if (mode === 'admin') {
      setAdminForm((current) => ({ ...current, [field]: value }));
      return;
    }
    setVoterForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <section className="grid min-h-[calc(100vh-110px)] place-items-center px-2 py-8 sm:py-12">
      <div className="w-full max-w-5xl">
        <div className="mb-8 text-center">
          <div className="inline-flex justify-center">
            <Logo />
          </div>
          <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">WUCC eVoting access</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">Secure portal sign in</h1>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
            Sign in as an approved voter or election administrator to continue to your workspace.
          </p>
        </div>

        <div className="mx-auto grid max-w-4xl overflow-hidden rounded-2xl border border-white/70 bg-white/80 shadow-[0_24px_80px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-950/90 dark:shadow-[0_24px_90px_rgba(0,0,0,0.55)] lg:grid-cols-[0.9fr_1.1fr]">
          <div className="hidden border-r border-slate-200 bg-slate-50/80 p-8 dark:border-slate-800 dark:bg-slate-900/75 lg:block">
            <div className="grid h-14 w-14 place-items-center rounded-xl bg-brand-600 text-white shadow-soft">
              {mode === 'voter' ? <Vote size={26} /> : <ShieldCheck size={26} />}
            </div>
            <h2 className="mt-8 text-2xl font-black tracking-tight dark:text-white">{mode === 'voter' ? 'Voter access' : 'Admin access'}</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-200">
              {mode === 'voter'
                ? 'Approved voters use their registered email and password to reach the voting dashboard.'
                : 'Election officers use their Supabase Auth credentials for dashboard and election controls.'}
            </p>
            <div className="mt-8 space-y-3">
              {['Protected routes', 'Audit-ready activity', 'Dark and light mode'].map((item) => (
                <div key={item} className="rounded-lg border border-slate-200 bg-white/80 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100">{item}</div>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-5 sm:p-8 lg:p-10" autoComplete="off">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">{mode === 'voter' ? 'Voter login' : 'Admin login'}</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">Welcome back</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-300">
                  {mode === 'voter' ? 'Use your approved email and password.' : 'Use your Supabase Auth email and password.'}
                </p>
              </div>
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/60 dark:text-brand-100 dark:ring-1 dark:ring-brand-700/50">
                {mode === 'voter' ? <Vote size={22} /> : <ShieldCheck size={22} />}
              </div>
            </div>

            <div className="mb-8 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-100/80 p-1.5 dark:border-slate-700 dark:bg-slate-900/80">
              <button type="button" onClick={() => switchMode('voter')} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition ${mode === 'voter' ? 'bg-slate-100 text-brand-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-white dark:ring-brand-700/60' : 'text-slate-500 hover:bg-white/60 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white'}`}><Vote size={17} />Voter</button>
              <button type="button" onClick={() => switchMode('admin')} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition ${mode === 'admin' ? 'bg-slate-100 text-brand-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-white dark:ring-brand-700/60' : 'text-slate-500 hover:bg-white/60 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white'}`}><ShieldCheck size={17} />Admin</button>
            </div>

            <div className="space-y-5">
          <label>
            <span className="label">Email</span>
            <div className="relative"><Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300" size={19} /><input type="email" name={mode === 'voter' ? 'wucc_voter_identifier' : 'wucc_admin_identifier'} className="input min-h-14 rounded-lg pl-12 text-base dark:border-slate-700 dark:bg-slate-900/85 dark:text-white dark:placeholder:text-slate-400 dark:hover:border-slate-600 dark:focus:border-brand-500 dark:focus:ring-brand-700/30" placeholder={mode === 'voter' ? 'Approved voter email' : 'Admin email'} value={form.email} onChange={(e) => updateCurrentForm('email', e.target.value)} autoComplete="off" data-lpignore="true" data-1p-ignore="true" required /></div>
          </label>
          <label>
            <span className="label">Password</span>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300" size={19} />
              <input type={showPassword ? 'text' : 'password'} name={mode === 'voter' ? 'wucc_voter_secret' : 'wucc_admin_secret'} className="input min-h-14 rounded-lg pl-12 pr-12 text-base dark:border-slate-700 dark:bg-slate-900/85 dark:text-white dark:placeholder:text-slate-400 dark:hover:border-slate-600 dark:focus:border-brand-500 dark:focus:ring-brand-700/30" placeholder="Password" value={form.password} onChange={(e) => updateCurrentForm('password', e.target.value)} autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" required />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white dark:focus:ring-brand-700/40"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          <StatusMessage>{error}</StatusMessage>
          <button className="btn-primary min-h-14 w-full rounded-lg text-base shadow-lg shadow-brand-600/20 hover:-translate-y-0.5" disabled={loading}>
            <LogIn size={18} />
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
          {mode === 'voter' && (
            <div className="space-y-3 text-center text-sm text-slate-500 dark:text-slate-400">
              <Link to="/forgot-password" className="font-bold text-brand-700 hover:underline dark:text-brand-200">Forgot password?</Link>
              <p>Dont have an account? <Link to="/register" className="font-bold text-brand-700 hover:underline dark:text-brand-200">Sign up</Link></p>
            </div>
          )}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
