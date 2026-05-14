import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clipboard, Download, Lock, Radio, Send, ShieldCheck, Sparkles, UserRound, Vote } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import SkeletonBlock from '../components/SkeletonBlock';
import StatusMessage from '../components/StatusMessage';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { castBallot, refreshVoterElectionStatus } from '../services/electionService';
import { getElectionCountdown, getElectionPhase, getPhaseBadgeClass, getPhaseLabel } from '../utils/electionTiming';

function CandidatePhoto({ candidate }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = candidate.photo_url || candidate.avatar || '';

  return (
    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
      {url && !failed ? (
        <>
          {!loaded && <div className="absolute inset-0 animate-pulse bg-slate-200 dark:bg-slate-700" />}
          <img
            src={url}
            alt={candidate.full_name}
            loading="lazy"
            className={`h-full w-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        </>
      ) : (
        <div className="grid h-full w-full place-items-center text-brand-600 dark:text-brand-200">
          <UserRound size={34} />
        </div>
      )}
    </div>
  );
}

function CandidateCard({ candidate, position, locked, selected, disabled, onVote }) {
  const promises = Array.isArray(candidate.promises)
    ? candidate.promises
    : String(candidate.promises || '').split('\n').filter(Boolean);

  return (
    <article className={`group relative overflow-hidden rounded-lg border p-4 transition duration-200 hover:-translate-y-1 hover:shadow-soft dark:shadow-none ${selected ? 'border-brand-500 bg-brand-50/80 ring-4 ring-brand-100 dark:bg-brand-950/50 dark:ring-brand-900/30' : 'border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80'}`}>
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-600 via-[#e84a1a] to-brand-600 opacity-0 transition group-hover:opacity-100" />
      <div className="flex flex-col gap-4 sm:flex-row">
        <CandidatePhoto candidate={candidate} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-black leading-tight tracking-tight">{candidate.full_name}</h3>
              <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">{candidate.department || 'Department not set'} - {candidate.level || 'Level not set'}</p>
            </div>
            {selected && <CheckCircle2 className="shrink-0 text-brand-600 dark:text-brand-300" size={22} />}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{position.title}</span>
            <span className="badge bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-100">CGPA {candidate.cgpa || 'N/A'}</span>
          </div>
        </div>
      </div>

      <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{candidate.manifesto || 'No manifesto provided yet.'}</p>

      <div className="mt-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-950/60">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Campaign promises</p>
        {promises.length ? (
          <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
            {promises.slice(0, 3).map((promise, index) => <li key={`${candidate.id}-${index}`}>- {promise}</li>)}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No campaign promises listed.</p>
        )}
      </div>

      <button type="button" className="btn-primary mt-4 w-full" onClick={() => onVote(candidate, position)} disabled={disabled || locked}>
        {locked ? <Lock size={17} /> : <Vote size={17} />}
        {selected ? 'Selected for this position' : locked ? 'Voting Closed' : 'Vote'}
      </button>
    </article>
  );
}

function voterFacingError(err) {
  const message = String(err?.message || '');
  if (/already submitted|already voted|duplicate/i.test(message)) return 'Ballot already submitted.';
  if (/active|unavailable|ended|inactive|standby/i.test(message)) return 'Voting is not open for this election.';
  if (/permission|row-level|policy|database|schema|column|relation/i.test(message)) return 'Unable to complete this action right now. Please contact election admin.';
  return message || 'Unable to submit vote. Please try again.';
}

export default function VotePage({ data }) {
  const { election, positions, loading: dataLoading, refresh } = data;
  const { voter, setVoter } = useAuth();
  const [selections, setSelections] = useState({});
  const [lockedPositions, setLockedPositions] = useState({});
  const [pendingChoice, setPendingChoice] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [ballotStatus, setBallotStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!voter?.id || !election?.id) return undefined;
    let active = true;
    setStatusLoading(true);
    setError('');
    refreshVoterElectionStatus(voter, election.id)
      .then(({ voter: freshVoter, ballot }) => {
        if (!active) return;
        setBallotStatus(ballot);
        if (ballot) setReceipt(ballot);
        if (freshVoter) setVoter?.(freshVoter);
      })
      .catch((err) => {
        if (!active) return;
        console.error('[vote] voter status refresh failed', err);
        setError(err?.message || 'Unable to refresh voter status.');
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, [voter?.id, election?.id, setVoter]);

  const votablePositions = useMemo(() => positions.filter((position) => position.candidates.length), [positions]);
  const requiredCount = votablePositions.length;
  const selectedCount = Object.keys(selections).length;
  const voterApproved = voter?.status === 'approved';
  const displayReceipt = receipt || ballotStatus;
  const receiptReady = Boolean(displayReceipt?.receipt_hash);
  const alreadyVoted = Boolean(voter?.has_voted || ballotStatus?.has_ballot || receipt);
  const phase = getElectionPhase(election, now);
  const countdown = getElectionCountdown(election, phase, now);
  const electionActive = phase === 'active';
  const voteClosedMessage = alreadyVoted
    ? 'Ballot already submitted.'
    : phase === 'ended' || phase === 'finalized'
      ? 'Election has ended.'
      : electionActive
        ? ''
        : 'Election has not started.';
  const ready = requiredCount > 0 && selectedCount === requiredCount && electionActive && voterApproved && !alreadyVoted;
  const checkingVoterStatus = Boolean(statusLoading && voter?.id && election?.id);
  const canShowBallot = !checkingVoterStatus && !alreadyVoted && voterApproved && electionActive;

  function confirmChoice() {
    if (!pendingChoice || alreadyVoted) return;
    setSelections((current) => ({ ...current, [pendingChoice.position.id]: pendingChoice.candidate.id }));
    setLockedPositions((current) => ({ ...current, [pendingChoice.position.id]: true }));
    setToast(`${pendingChoice.candidate.full_name} selected for ${pendingChoice.position.title}.`);
    setPendingChoice(null);
  }

  async function submitVote() {
    setError('');
    setMessage('');
    if (!ready) {
      setError('Select one candidate for every available position before submitting your ballot.');
      return;
    }
    setSubmitting(true);
    window.__WUCC_BALLOT_SUBMITTING = true;
    try {
      const result = await castBallot(voter, selections);
      const completedReceipt = result ? { ...result, has_ballot: true } : null;
      setReceipt(completedReceipt);
      setBallotStatus(completedReceipt);
      setMessage(`Vote successfully validated and added to consortium ledger. Receipt ${result?.receipt_hash?.slice(0, 18) || result?.tx_hash?.slice(0, 18) || 'saved'} is ready.`);
      setToast('Your ballot was submitted successfully.');
      setVoter?.({ ...voter, has_voted: true });
      if (election?.id) {
        const fresh = await refreshVoterElectionStatus({ ...voter, has_voted: true }, election.id);
        if (fresh.voter) setVoter?.(fresh.voter);
        if (fresh.ballot) {
          setReceipt(fresh.ballot);
          setBallotStatus(fresh.ballot);
        }
      }
      await refresh();
    } catch (err) {
      console.error('cast_ballot failed:', err?.supabaseError || err);
      setError(voterFacingError(err));
    } finally {
      window.__WUCC_BALLOT_SUBMITTING = false;
      setSubmitting(false);
    }
  }

  async function copyReceipt() {
    if (!receiptReady) return;
    await navigator.clipboard?.writeText(displayReceipt.receipt_hash);
    setToast('Receipt copied');
  }

  function downloadReceipt() {
    if (!receiptReady) return;
    const lines = [
      'WUCC eVoting Receipt',
      `Election: ${displayReceipt.election_title || election?.title || 'WUCC Election'}`,
      `Receipt Hash: ${displayReceipt.receipt_hash}`,
      `Block Hash: ${displayReceipt.block_hash || 'N/A'}`,
      `Block Number: ${displayReceipt.block_number || 'N/A'}`,
      `Anonymous ID: ${displayReceipt.anonymous_verification_id || 'N/A'}`,
      `PBFT Confirmations: ${displayReceipt.confirmation_count || '3+'}/5`,
      `Timestamp: ${displayReceipt.created_at || new Date().toISOString()}`
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wucc-vote-receipt-${displayReceipt.block_number || Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-6">
      <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-600 via-[#e84a1a] to-brand-600" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Candidate voting</p>
            <h1 className="text-3xl font-black tracking-tight">{election?.title || 'WUCC Election'}</h1>
          </div>
          <span className={`badge ${getPhaseBadgeClass(phase)}`}>
            <Radio className={electionActive ? 'animate-pulse' : ''} size={14} /> {getPhaseLabel(phase)}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="text-xs text-slate-500">Voter</p><p className="truncate font-bold">{voter?.full_name || 'Linked voter not found'}</p></div>
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="text-xs text-slate-500">Matric</p><p className="truncate font-bold">{voter?.matric || 'N/A'}</p></div>
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="text-xs text-slate-500">Progress</p><p className="font-bold">{selectedCount}/{requiredCount} positions</p></div>
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="text-xs text-slate-500">{countdown.label}</p><p className="flex items-center gap-1 font-bold">{phase === 'ended' || phase === 'finalized' ? <><Lock size={15} />Voting Closed</> : countdown.text}</p></div>
        </div>
      </div>

      <StatusMessage>{error || (!alreadyVoted && !voterApproved ? 'Only approved voters can vote.' : '') || (!alreadyVoted && !electionActive ? voteClosedMessage : '')}</StatusMessage>
      <StatusMessage type="success">{message}</StatusMessage>

      {checkingVoterStatus && (
        <div className="card p-5">
          <p className="text-sm font-semibold text-slate-500">Checking your ballot status...</p>
        </div>
      )}

      {alreadyVoted && (
        <div className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Ballot submitted successfully</p>
              <h2 className="text-xl font-black tracking-tight">Your vote has been recorded on the consortium blockchain ledger.</h2>
            </div>
            <span className="badge bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">{displayReceipt?.validation_status || displayReceipt?.validator_status || 'pbft_confirmed'}</span>
          </div>
          {!statusLoading && !receiptReady && (
            <StatusMessage>Receipt record not found. Please contact election admin.</StatusMessage>
          )}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Receipt hash</p>
              <p className="mt-1 break-all font-mono text-sm">{displayReceipt?.receipt_hash || (statusLoading ? 'Checking ledger...' : 'Receipt record not found')}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Block hash</p>
              <p className="mt-1 break-all font-mono text-sm">{displayReceipt?.block_hash || 'N/A'}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Block number</p>
              <p className="mt-1 text-sm font-bold">#{displayReceipt?.block_number || 'N/A'}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Timestamp</p>
              <p className="mt-1 text-sm font-bold">{displayReceipt?.created_at ? new Date(displayReceipt.created_at).toLocaleString() : 'N/A'}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Anonymous ID</p>
              <p className="mt-1 font-mono text-sm font-bold">{displayReceipt?.anonymous_verification_id || 'N/A'}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">PBFT confirmations</p>
              <p className="mt-1 text-sm font-bold">{displayReceipt?.confirmation_count || '3+'}/5 validators</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to={receiptReady ? `/verify?receipt=${encodeURIComponent(displayReceipt.receipt_hash)}` : '/verify'} className="btn-primary"><ShieldCheck size={17} />Verify Receipt</Link>
            <Link to="/results" className="btn-secondary"><Radio size={17} />View Results</Link>
            <button type="button" className="btn-secondary" onClick={copyReceipt} disabled={!receiptReady}><Clipboard size={17} />Copy receipt</button>
            <button type="button" className="btn-secondary" onClick={downloadReceipt} disabled={!receiptReady}><Download size={17} />Download</button>
          </div>
        </div>
      )}

      {canShowBallot && dataLoading && (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => <SkeletonBlock key={index} className="h-72" />)}
        </div>
      )}

      {canShowBallot && !dataLoading && !votablePositions.length && (
        <div className="card grid place-items-center p-10 text-center">
          <Sparkles className="mb-3 text-brand-600" size={34} />
          <h2 className="text-xl font-black">No approved candidates yet</h2>
          <p className="mt-2 max-w-md text-sm text-slate-500">No candidates are available for voting yet. Approved candidates will appear here after election officers complete review.</p>
        </div>
      )}

      {canShowBallot && (
      <div className="space-y-6">
        {votablePositions.map((position) => (
          <section key={position.id} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-black tracking-tight">{position.title}</h2>
              <p className="text-sm text-slate-500">Choose one candidate for this position. PBFT validation runs after ballot submission.</p>
              </div>
              <span className={`badge ${lockedPositions[position.id] ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-100' : 'bg-slate-100 text-slate-600 dark:bg-slate-800'}`}>
                {lockedPositions[position.id] ? <><Lock size={14} />Voting Closed</> : `${position.candidates.length} candidate(s)`}
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {position.candidates.map((candidate) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  position={position}
                  selected={selections[position.id] === candidate.id}
                  locked={Boolean(lockedPositions[position.id])}
                  disabled={!canShowBallot || submitting}
                  onVote={(nextCandidate, nextPosition) => {
                    if (alreadyVoted) return;
                    setPendingChoice({ candidate: nextCandidate, position: nextPosition });
                  }}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      )}

      {canShowBallot && (
      <div className="sticky bottom-4 z-20 rounded-lg border border-slate-200 bg-white/95 p-4 shadow-soft backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{Math.max(requiredCount - selectedCount, 0)} position(s) remaining</p>
          <button className="btn-primary" onClick={submitVote} disabled={!ready || submitting}>
            <Send size={18} />{submitting ? 'Submitting...' : 'Submit ballot'}
          </button>
        </div>
      </div>
      )}

      <ConfirmModal
        open={Boolean(pendingChoice) && !alreadyVoted}
        title="Confirm vote choice"
        message={pendingChoice ? `Are you sure you want to vote for ${pendingChoice.candidate.full_name}?` : ''}
        confirmLabel="Yes, select candidate"
        onConfirm={confirmChoice}
        onClose={() => setPendingChoice(null)}
      />
      <Toast onClose={() => setToast('')}>{toast}</Toast>
    </section>
  );
}
