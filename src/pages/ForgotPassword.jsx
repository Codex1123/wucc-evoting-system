import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, KeyRound, Mail, Send, ShieldCheck } from 'lucide-react';
import Logo from '../components/Logo';
import StatusMessage from '../components/StatusMessage';
import { requestVoterPasswordReset } from '../services/electionService';

const emptyForm = { email: '', matric: '' };

export default function ForgotPassword() {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await requestVoterPasswordReset(form);
      setForm(emptyForm);
      setSuccess('Your reset request has been submitted for admin review.');
    } catch (err) {
      console.error('[auth] reset request failed', err);
      setError(err?.message || 'Unable to submit the reset request right now.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="grid min-h-[calc(100vh-110px)] place-items-center px-2 py-8 sm:py-12">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <div className="inline-flex justify-center">
            <Logo />
          </div>
          <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">WUCC eVoting access</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">Forgot password</h1>
          <p className="mx-auto mt-3 max-w-lg text-base leading-7 text-slate-600 dark:text-slate-300">
            Submit your registered voter details for admin review.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="overflow-hidden rounded-2xl border border-white/70 bg-white/85 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-950/90 dark:shadow-[0_24px_90px_rgba(0,0,0,0.55)] sm:p-8" autoComplete="off">
          <div className="mb-7 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Password reset</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">Request admin review</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-300">If your record matches, a reset request will be sent for review.</p>
            </div>
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/60 dark:text-brand-100 dark:ring-1 dark:ring-brand-700/50">
              <ShieldCheck size={22} />
            </div>
          </div>

          <div className="space-y-5">
            <label>
              <span className="label">Registered email</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300" size={19} />
                <input
                  type="email"
                  className="input min-h-14 rounded-lg pl-12 text-base dark:border-slate-700 dark:bg-slate-900/85 dark:text-white dark:placeholder:text-slate-400 dark:hover:border-slate-600 dark:focus:border-brand-500 dark:focus:ring-brand-700/30"
                  placeholder="Approved voter email"
                  value={form.email}
                  onChange={(event) => updateField('email', event.target.value)}
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  required
                />
              </div>
            </label>

            <label>
              <span className="label">Matric number</span>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300" size={19} />
                <input
                  className="input min-h-14 rounded-lg pl-12 text-base dark:border-slate-700 dark:bg-slate-900/85 dark:text-white dark:placeholder:text-slate-400 dark:hover:border-slate-600 dark:focus:border-brand-500 dark:focus:ring-brand-700/30"
                  placeholder="COSC/21045"
                  value={form.matric}
                  onChange={(event) => updateField('matric', event.target.value)}
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  required
                />
              </div>
            </label>

            <StatusMessage>{error}</StatusMessage>
            <StatusMessage type="success">{success}</StatusMessage>

            <button className="btn-primary min-h-14 w-full rounded-lg text-base shadow-lg shadow-brand-600/20 hover:-translate-y-0.5" disabled={loading}>
              <Send size={18} />
              {loading ? 'Submitting...' : 'Submit reset request'}
            </button>

            <Link to="/login" className="btn-secondary min-h-12 w-full justify-center rounded-lg">
              <ArrowLeft size={17} />
              Back to login
            </Link>
          </div>
        </form>
      </div>
    </section>
  );
}
