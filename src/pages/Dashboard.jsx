import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, CheckCircle2, Clipboard, Clock, Download, Eye, EyeOff, FileSearch, FileText, Hash, KeyRound, ShieldCheck, UserRoundCheck, UsersRound, Vote } from 'lucide-react';
import StatCard from '../components/StatCard';
import StatusMessage from '../components/StatusMessage';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { changeVoterPassword, refreshVoterElectionStatus } from '../services/electionService';
import { isElectionManagerRole, normalizeRole, roleLabel } from '../services/roles';
import { getElectionPhase, getPhaseLabel } from '../utils/electionTiming';

function PasswordField({ field, label, value, visible, onChange, onToggle }) {
  return (
    <label>
      <span className="label">{label}</span>
      <div className="relative">
        <input
          className="input pr-12"
          type={visible ? 'text' : 'password'}
          name={`wucc_${field}`}
          value={value}
          onChange={(event) => onChange(field, event.target.value)}
          autoComplete="new-password"
          data-lpignore="true"
          data-1p-ignore="true"
          required
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white dark:focus:ring-brand-700/40"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onToggle(field)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </label>
  );
}

export default function Dashboard({ data }) {
  const { profile, voter, setVoter } = useAuth();
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordVisible, setPasswordVisible] = useState({ currentPassword: false, newPassword: false, confirmPassword: false });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [ballotStatus, setBallotStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [toast, setToast] = useState('');
  const { election, positions, voters, ballots, stats, applications, loading, error } = data;
  const approved = stats?.approved_voters ?? voters.filter((item) => item.status === 'approved').length;
  const voted = stats?.voted_voters ?? voters.filter((item) => item.has_voted).length;
  const pendingApplications = applications.filter((application) => application.status === 'pending').length;
  const role = normalizeRole(profile?.role);
  const manager = isElectionManagerRole(role);
  const commissioner = role === 'commissioner';
  const observer = role === 'observer';
  const voterRole = role === 'voter';
  const voterApproved = voterRole && String(voter?.status || '').toLowerCase() === 'approved';
  const mustChangePassword = voterRole && Boolean(voter?.must_change_password || voter?.password_is_default);
  const voterHasVoted = Boolean(voter?.has_voted || ballotStatus?.has_ballot);
  const voterStatusText = voterHasVoted ? 'Voted' : voterApproved ? 'Approved to vote' : 'Not approved';
  const electionPhase = getElectionPhase(election);
  const electionActive = electionPhase === 'active';
  const electionLockedReason = electionPhase === 'ended' || electionPhase === 'finalized'
    ? 'Election has ended'
    : electionActive
      ? ''
      : 'Election has not started';
  const receiptReady = Boolean(ballotStatus?.receipt_hash);
  const receiptStatusText = voterHasVoted ? (receiptReady ? 'Receipt ready' : 'Receipt pending') : 'No receipt yet';
  const pbftStatusText = receiptReady ? (ballotStatus?.validation_status || 'pbft_confirmed') : voterHasVoted ? 'Pending receipt lookup' : 'Awaiting ballot';
  const visibleDataError = error ? 'Unable to load dashboard data. Please refresh or contact election admin.' : '';

  useEffect(() => {
    if (!voterRole || !voter?.id || !election?.id) return undefined;
    let active = true;
    setStatusLoading(true);
    setStatusError('');
    refreshVoterElectionStatus(voter, election.id)
      .then(({ voter: freshVoter, ballot }) => {
        if (!active) return;
        setBallotStatus(ballot);
        if (freshVoter) setVoter(freshVoter);
      })
      .catch((err) => {
        if (!active) return;
        console.error('[dashboard] voter status refresh failed', err);
        setStatusError('Unable to refresh voter status. Please try again.');
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, [voterRole, voter?.id, election?.id, setVoter]);

  async function submitPasswordChange(event) {
    event.preventDefault();
    if (!voter?.id || passwordBusy) return;
    setPasswordBusy(true);
    setPasswordError('');
    setPasswordSuccess('');
    try {
      const nextVoter = await changeVoterPassword({ voterId: voter.id, voterMatric: voter.matric, ...passwordForm });
      setVoter(nextVoter);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordSuccess('Password updated successfully.');
    } catch (err) {
      console.error('[voter] password change failed', err);
      setPasswordError(err?.message || 'Unable to update password.');
    } finally {
      setPasswordBusy(false);
    }
  }

  async function copyReceipt() {
    if (!receiptReady) return;
    await navigator.clipboard?.writeText(ballotStatus.receipt_hash);
    setToast('Receipt copied');
  }

  function downloadReceipt() {
    if (!receiptReady) return;
    const lines = [
      'WUCC eVoting Receipt',
      `Election: ${ballotStatus.election_title || election?.title || 'WUCC Election'}`,
      `Receipt Hash: ${ballotStatus.receipt_hash}`,
      `Block Hash: ${ballotStatus.block_hash || 'N/A'}`,
      `Block Number: ${ballotStatus.block_number || 'N/A'}`,
      `Anonymous ID: ${ballotStatus.anonymous_verification_id || 'N/A'}`,
      `PBFT Confirmations: ${ballotStatus.confirmation_count || '3+'}/5`,
      `Timestamp: ${ballotStatus.created_at || new Date().toISOString()}`
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wucc-vote-receipt-${ballotStatus.block_number || Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function updatePasswordField(field, value) {
    setPasswordForm((current) => ({ ...current, [field]: value }));
  }

  function togglePasswordVisibility(field) {
    setPasswordVisible((current) => ({ ...current, [field]: !current[field] }));
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Dashboard</p>
          <h1 className="text-3xl font-black tracking-tight">{election?.title || 'WUCC Election'}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {commissioner ? 'Election officer workspace' : manager ? 'Election management overview' : observer ? 'Read-only observer overview' : `Welcome, ${voter?.full_name || profile?.full_name || 'voter'}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {manager && <Link to="/admin" className="btn-primary"><ShieldCheck size={18} />Admin dashboard</Link>}
          {(!voterRole || (voterApproved && !mustChangePassword)) && <Link to="/results" className="btn-secondary"><BarChart3 size={18} />Results</Link>}
          {voterApproved && !mustChangePassword && <Link to="/verify" className="btn-secondary"><FileSearch size={18} />Verify</Link>}
          {voterApproved && !mustChangePassword && (voterHasVoted || electionActive ? <Link to="/vote" className="btn-secondary"><Vote size={18} />{voterHasVoted ? 'View ballot' : 'Vote'}</Link> : <button type="button" className="btn-secondary opacity-60" disabled><Vote size={18} />Vote</button>)}
        </div>
      </div>

      <StatusMessage>{visibleDataError}</StatusMessage>
      <StatusMessage>{statusError}</StatusMessage>
      {!mustChangePassword && <StatusMessage type="success">{passwordSuccess}</StatusMessage>}

      {commissioner && (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Commissioner dashboard</p>
                <h2 className="text-2xl font-black tracking-tight">Election operations command</h2>
                <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
                  Supervise voter approvals, candidate eligibility, live election operations, PBFT validation, receipts, audit activity, and finalized ledger monitoring under Super Admin authority.
                </p>
              </div>
              <span className="badge bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-100">{roleLabel(role)}</span>
            </div>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Election operations', 'Start, pause, end, and monitor turnout plus timer status.', ShieldCheck],
              ['Candidate approvals', 'Approve or reject eligible applications before activation locks approvals.', UserRoundCheck],
              ['Voter management', 'Approve registrations, reject invalid records, and monitor voting activity.', UsersRound],
              ['Ledger oversight', 'Review PBFT confirmations, receipts, blocks, audit logs, and results.', Hash]
            ].map(([title, text, Icon]) => (
              <div key={title} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-100">
                  <Icon size={20} />
                </div>
                <h3 className="font-black">{title}</h3>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{text}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                Restricted controls remain Super Admin-only: election cycles, ledger finalization, RBAC, system configuration, record deletion, and reset operations.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link to="/admin" className="btn-primary"><ShieldCheck size={18} />Operations</Link>
                <Link to="/history" className="btn-secondary"><FileText size={18} />Election history</Link>
                <Link to="/results" className="btn-secondary"><BarChart3 size={18} />Results</Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {mustChangePassword && (
        <form onSubmit={submitPasswordChange} className="card p-5" autoComplete="off">
          <div className="mb-4 flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-100">
              <KeyRound size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold">Please update your password.</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Enter your temporary password, then choose a private password before continuing.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <PasswordField
              field="currentPassword"
              label="Temporary password"
              value={passwordForm.currentPassword}
              visible={passwordVisible.currentPassword}
              onChange={updatePasswordField}
              onToggle={togglePasswordVisibility}
            />
            <PasswordField
              field="newPassword"
              label="New password"
              value={passwordForm.newPassword}
              visible={passwordVisible.newPassword}
              onChange={updatePasswordField}
              onToggle={togglePasswordVisibility}
            />
            <PasswordField
              field="confirmPassword"
              label="Confirm new password"
              value={passwordForm.confirmPassword}
              visible={passwordVisible.confirmPassword}
              onChange={updatePasswordField}
              onToggle={togglePasswordVisibility}
            />
          </div>
          <div className="mt-4 space-y-3">
            <StatusMessage>{passwordError}</StatusMessage>
            <StatusMessage type="success">{passwordSuccess}</StatusMessage>
            <button className="btn-primary" disabled={passwordBusy}><KeyRound size={18} />{passwordBusy ? 'Updating...' : 'Change password'}</button>
          </div>
        </form>
      )}

      {voterRole && !mustChangePassword && (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Voter account</p>
                <h2 className="text-2xl font-black tracking-tight">Welcome, {voter?.full_name || profile?.full_name || 'voter'}</h2>
              </div>
              <span className={`badge ${voterHasVoted ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-100' : voterApproved ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100' : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-100'}`}>
                {statusLoading ? 'Checking status...' : voterStatusText}
              </span>
            </div>
          </div>
          <div className="grid gap-3 border-b border-slate-200 p-5 dark:border-slate-800 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Election status', getPhaseLabel(electionPhase), electionActive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'],
              ['Voting status', voterHasVoted ? 'Ballot already submitted' : electionLockedReason || voterStatusText, voterHasVoted ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-100' : voterApproved && electionActive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100' : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-100'],
              ['Receipt status', receiptStatusText, receiptReady ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'],
              ['PBFT validation', pbftStatusText, receiptReady ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200']
            ].map(([label, value, badgeClass]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
                <span className={`mt-2 inline-flex badge ${badgeClass}`}>{value}</span>
              </div>
            ))}
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Matric number', voter?.matric],
              ['Department', voter?.department],
              ['Level', voter?.level],
              ['Voting status', voterStatusText]
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-2 break-words text-sm font-bold">{value || 'N/A'}</p>
              </div>
            ))}
          </div>
          {voterHasVoted && (
            <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-800">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-100">Receipt hash</p>
                    <p className="mt-2 break-all font-mono text-sm font-bold text-emerald-950 dark:text-emerald-50">{ballotStatus?.receipt_hash || 'Receipt recorded. Open Verify Receipt to confirm the ledger entry.'}</p>
                  </div>
                  <Hash className="text-emerald-700 dark:text-emerald-100" size={22} />
                </div>
                {ballotStatus?.block_number && <p className="mt-2 text-sm font-semibold text-emerald-800 dark:text-emerald-100">Block #{ballotStatus.block_number}</p>}
              </div>
            </div>
          )}
          {voterApproved && (
            <div className="flex flex-wrap gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
              {voterHasVoted || electionActive ? <Link to="/vote" className="btn-primary"><Vote size={18} />{voterHasVoted ? 'View ballot' : 'Vote'}</Link> : <button type="button" className="btn-primary opacity-60" disabled title={electionLockedReason}><Vote size={18} />Vote</button>}
              <Link to="/results" className="btn-secondary"><BarChart3 size={18} />Results</Link>
              <Link to="/verify" className="btn-secondary"><FileSearch size={18} />Verify</Link>
            </div>
          )}
        </div>
      )}

      {voterRole && (
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="card p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">My Receipt</p>
                <h2 className="text-xl font-black tracking-tight">Blockchain receipt</h2>
              </div>
              <span className={`badge ${receiptReady ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                {receiptStatusText}
              </span>
            </div>
            {receiptReady ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Receipt hash</p>
                  <p className="mt-2 break-all font-mono text-sm font-bold">{ballotStatus.receipt_hash}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><p className="text-xs text-slate-500">Block</p><p className="font-bold">#{ballotStatus.block_number || 'N/A'}</p></div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><p className="text-xs text-slate-500">PBFT</p><p className="font-bold">{ballotStatus.confirmation_count || '3+'}/5</p></div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><p className="text-xs text-slate-500">Status</p><p className="font-bold">{ballotStatus.validation_status || 'pbft_confirmed'}</p></div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700">
                {voterHasVoted ? 'No receipt found yet. Please contact election admin if this remains unavailable.' : 'No receipt yet. Submit a ballot during an active election to receive one.'}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={copyReceipt} disabled={!receiptReady}><Clipboard size={17} />Copy receipt</button>
              <button type="button" className="btn-secondary" onClick={downloadReceipt} disabled={!receiptReady}><Download size={17} />Download</button>
              <Link to={receiptReady ? `/verify?receipt=${encodeURIComponent(ballotStatus.receipt_hash)}` : '/verify'} className="btn-primary"><FileSearch size={17} />Verify receipt</Link>
            </div>
          </div>

          <div className="card p-5">
            <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">How voting works</p>
            <h2 className="mt-1 text-lg font-black tracking-tight">Consortium ledger flow</h2>
            <div className="mt-4 space-y-3">
              {[
                ['Login', 'Use your approved voter account.'],
                ['Vote once', 'Select one candidate per office.'],
                ['PBFT validation', 'Validator nodes confirm the ballot.'],
                ['Receipt verification', 'Use the receipt hash to verify.'],
                ['Results update', 'Confirmed ballots update totals.']
              ].map(([title, text], index) => (
                <div key={title} className="flex gap-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-sm font-black text-brand-700 dark:bg-brand-950 dark:text-brand-100">{index + 1}</div>
                  <div>
                    <p className="text-sm font-bold">{title}</p>
                    <p className="text-sm text-slate-500">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Approved voters" value={loading ? '...' : approved} icon={UsersRound} />
        <StatCard title="Votes cast" value={loading ? '...' : voted} icon={CheckCircle2} tone="green" />
        <StatCard title="Open positions" value={loading ? '...' : positions.length} icon={Vote} tone="amber" />
        <StatCard title="Receipts" value={loading ? '...' : ballots.length} icon={Clock} tone="slate" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Position readiness</h2>
            <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-100">{positions.length} offices</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {positions.map((position) => (
              <div key={position.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-black">{position.title}</h3>
                  <span className="text-xs font-semibold text-slate-500">{position.candidates.length} candidates</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, position.candidates.length * 25)}%` }} />
                </div>
              </div>
            ))}
            {!positions.length && (
              <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700">
                No positions or approved candidates are ready yet.
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="card p-5">
            <h2 className="text-lg font-bold">Account access</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3"><span className="text-slate-500">Role</span><strong>{roleLabel(role)}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Election</span><strong className="capitalize">{election?.status || 'inactive'}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Mode</span><strong>{observer ? 'Read-only' : commissioner ? 'Election officer' : manager ? 'Manager' : 'Voter'}</strong></div>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-lg font-bold">Candidate pipeline</h2>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
              <div>
                <p className="text-3xl font-black">{pendingApplications}</p>
                <p className="text-sm text-slate-500">Pending applications</p>
              </div>
              <FileText className="text-brand-600" size={28} />
            </div>
            {manager ? (
              <Link to="/admin" className="btn-secondary mt-4 w-full">Review applications</Link>
            ) : observer ? (
              <Link to="/results" className="btn-secondary mt-4 w-full">Monitor results</Link>
            ) : !voterRole ? (
              <Link to="/apply" className="btn-secondary mt-4 w-full">Apply as candidate</Link>
            ) : null}
          </div>
        </aside>
      </div>
      <Toast onClose={() => setToast('')}>{toast}</Toast>
    </section>
  );
}
