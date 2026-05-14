import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Mail, Send, UserRound, UserRoundCheck } from 'lucide-react';
import Logo from '../components/Logo';
import StatusMessage from '../components/StatusMessage';
import { departmentOptions, levelOptions } from '../constants/formOptions';
import { registerVoter } from '../services/electionService';

const emptyRegistration = { full_name: '', matric: '', department: '', level: '', email: '' };
const REGISTER_DRAFT_KEY = 'wucc_register_draft';

function readRegistrationDraft() {
  try {
    const parsed = JSON.parse(localStorage.getItem(REGISTER_DRAFT_KEY) || 'null');
    return parsed ? { ...emptyRegistration, ...parsed } : emptyRegistration;
  } catch {
    return emptyRegistration;
  }
}

export default function Register() {
  const [form, setForm] = useState(readRegistrationDraft);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    localStorage.setItem(REGISTER_DRAFT_KEY, JSON.stringify(form));
  }, [form]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await registerVoter(form);
      setForm(emptyRegistration);
      localStorage.removeItem(REGISTER_DRAFT_KEY);
      setSuccess('Registration submitted successfully. Please wait for admin approval before logging in.');
    } catch (err) {
      console.error('[registration] voter registration failed', err);
      setError(err?.message || 'Unable to submit voter registration.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="grid min-h-[calc(100vh-110px)] items-center gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="max-w-2xl">
        <Logo />
        <h1 className="mt-8 text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">Register to vote</h1>
        <p className="mt-4 text-lg leading-8 text-slate-600 dark:text-slate-300">
          Submit your WUCC voter details for review. Approved voters sign in with email and password.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {['Pending by default', 'Admin reviewed', 'One voter record'].map((item) => (
            <div key={item} className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">{item}</div>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card p-5 sm:p-6" autoComplete="off">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Voter registration</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight">Student details</h2>
          </div>
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-100">
            <UserRoundCheck size={22} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="label">Full name</span>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-3.5 text-slate-400" size={18} />
              <input className="input pl-10" placeholder="Enter full name" value={form.full_name} onChange={(e) => updateField('full_name', e.target.value)} required />
            </div>
          </label>
          <label>
            <span className="label">Matric number</span>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-3.5 text-slate-400" size={18} />
              <input className="input pl-10" placeholder="COSC/21045" value={form.matric} onChange={(e) => updateField('matric', e.target.value)} required />
            </div>
          </label>
          <label>
            <span className="label">Email address</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-3.5 text-slate-400" size={18} />
              <input type="email" className="input pl-10" placeholder="name@example.com" value={form.email} onChange={(e) => updateField('email', e.target.value)} autoComplete="off" required />
            </div>
          </label>
          <label>
            <span className="label">Department</span>
            <select className="input" value={form.department} onChange={(e) => updateField('department', e.target.value)} required>
              <option value="">Select department</option>
              {departmentOptions.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
          </label>
          <label>
            <span className="label">Level</span>
            <select className="input" value={form.level} onChange={(e) => updateField('level', e.target.value)} required>
              <option value="">Select level</option>
              {levelOptions.map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-5 space-y-4">
          <StatusMessage>{error}</StatusMessage>
          <StatusMessage type="success">{success}</StatusMessage>
          <button className="btn-primary w-full" disabled={loading}>
            <Send size={18} />
            {loading ? 'Submitting...' : 'Submit registration'}
          </button>
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            Already approved? <Link to="/login" className="font-bold text-brand-700 hover:underline dark:text-brand-200">Go to login</Link>
          </p>
        </div>
      </form>
    </section>
  );
}
