import { memo, useEffect, useMemo, useState } from 'react';
import { Blocks, Check, Copy, Eye, EyeOff, FileText, KeyRound, Loader2, Play, PlusCircle, RefreshCcw, Save, Search, ShieldCheck, Square, Trash2, UserPlus, UserRound, X } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import StatusMessage from '../components/StatusMessage';
import StatCard from '../components/StatCard';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { permissionsFor, roleLabel } from '../services/roles';
import { approveVoterPasswordReset, createNewElectionCycle, deleteCandidate, deleteCandidateApplication, deleteVoter, rejectVoterPasswordReset, resetElectionData, saveElectionSettings, updateApplicationStatus, updateCandidateStatus, updateVoterStatus, upsertVoter } from '../services/electionService';
import { departmentOptions, levelOptions } from '../constants/formOptions';
import { getWuccPositionTitle, sortWuccPositions } from '../constants/wuccPositions';
import { getElectionCountdown, getElectionPhase, getPhaseBadgeClass, getPhaseLabel } from '../utils/electionTiming';

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function statusBadgeClass(status) {
  if (status === 'approved') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100';
  if (status === 'rejected') return 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-100';
  return 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-100';
}

function compactDate(value) {
  return value ? new Date(value).toLocaleString() : 'N/A';
}

function MobileDetail({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 break-words text-sm font-medium text-slate-800 dark:text-slate-100">{value || 'N/A'}</p>
    </div>
  );
}

function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = new Uint32Array(6);
  window.crypto.getRandomValues(values);
  const token = Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
  return values[0] % 2 === 0 ? `VT-${token.slice(0, 4)}-${token.slice(4, 6)}` : `WUCC#${token.slice(0, 4)}`;
}

function validateTemporaryPassword(password, voter) {
  const value = String(password || '').trim();
  const simple = ['123456', '12345678', 'password', 'qwerty', 'qwerty123', 'voter123', 'admin123'];
  if (value.length < 8) return 'Temporary password must be at least 8 characters.';
  if (String(voter?.matric || '').trim().toLowerCase() === value.toLowerCase()) return 'Temporary password must not equal the matric number.';
  if (String(voter?.email || '').trim().toLowerCase() === value.toLowerCase()) return 'Temporary password must not equal the voter email.';
  if (simple.includes(value.toLowerCase())) return 'Temporary password is too simple.';
  return '';
}

const CandidateReviewPhoto = memo(function CandidateReviewPhoto({ candidate, photoCache, onPhotoState }) {
  const url = candidate?.photo_url || '';
  const state = url ? photoCache[url]?.status : null;
  const loaded = state === 'loaded';
  const failed = state === 'error';
  const slow = state === 'slow';

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700 min-h-[220px] max-h-[320px] md:min-h-[280px] md:max-h-[420px]">
      {url && !failed ? (
        <>
          {!loaded && (
            <div className="absolute inset-0 animate-pulse bg-slate-200 dark:bg-slate-700">
              <div className="grid h-full place-items-center text-xs font-semibold text-slate-500 dark:text-slate-300">
                Loading photo...
              </div>
            </div>
          )}
          <img
            src={url}
            alt={candidate.full_name}
            loading="lazy"
            decoding="async"
            className={`h-full max-h-[420px] w-full object-contain transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => onPhotoState(url, 'loaded')}
            onError={() => onPhotoState(url, 'error')}
          />
          {slow && !loaded && (
            <div className="absolute inset-0 grid place-items-center bg-slate-100/90 text-sm font-semibold text-slate-600 dark:bg-slate-900/90 dark:text-slate-200">
              Photo is taking longer than usual...
            </div>
          )}
        </>
      ) : (
        <div className="grid h-full place-items-center text-slate-500">
          <div className="grid gap-2 text-center text-sm font-semibold">
            <UserRound className="mx-auto text-brand-600 dark:text-brand-200" size={34} />
            <span>{url ? 'Photo unavailable' : 'No photo'}</span>
          </div>
        </div>
      )}
    </div>
  );
});

export default function Admin({ data }) {
  const { profile } = useAuth();
  const perms = permissionsFor(profile?.role);
  const { election, voters, applications, candidates, stats, loading: dataLoading, error: dataError, refresh, removeVoterLocal, removeCandidateLocal, ledger = [], auditLogs = [], passwordResetRequests = [] } = data;
  const [settings, setSettings] = useState(() => ({
    title: election?.title || 'Votechain Election',
    startsAt: toLocalInput(election?.starts_at),
    endsAt: toLocalInput(election?.ends_at)
  }));
  const [voterForm, setVoterForm] = useState({ full_name: '', matric: '', department: '', level: '', email: '', status: 'pending', auth_user_id: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const approved = stats?.approved_voters ?? voters.filter((v) => v.status === 'approved').length;
  const pending = voters.filter((v) => v.status === 'pending').length;
  const voted = stats?.voted_voters ?? voters.filter((v) => v.has_voted).length;
  const pendingVoters = useMemo(() => voters.filter((voter) => voter.status === 'pending'), [voters]);
  const pendingPasswordResetRequests = useMemo(() => passwordResetRequests.filter((request) => request.status === 'pending'), [passwordResetRequests]);
  const currentPositions = useMemo(() => sortWuccPositions(data.positions || []), [data.positions]);
  const positionTitleById = useMemo(() => new Map(currentPositions.map((position) => [position.id, getWuccPositionTitle(position)])), [currentPositions]);
  const positionLabel = (positionId) => positionTitleById.get(positionId) || 'Unknown position';
  const candidateRows = useMemo(() => {
    const rows = applications.map((app) => {
      const linkedCandidate = candidates.find((candidate) => candidate.application_id === app.id);
      return {
        ...app,
        row_id: `application-${app.id}`,
        row_type: 'application',
        source: 'application',
        application_id: app.id,
        candidate_id: linkedCandidate?.id || null,
        candidate_status: linkedCandidate?.status || null,
        status: linkedCandidate?.status || app.status,
        submitted_at: app.created_at
      };
    });
    const applicationIds = new Set(applications.map((app) => app.id));
    const candidateOnly = candidates
      .filter((candidate) => !candidate.application_id || !applicationIds.has(candidate.application_id))
      .map((candidate) => ({
        ...candidate,
        row_id: `candidate-${candidate.id}`,
        row_type: 'candidate',
        source: 'candidate',
        application_id: candidate.application_id || null,
        candidate_id: candidate.id,
        submitted_at: candidate.created_at
      }));
    return [...rows, ...candidateOnly].sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));
  }, [applications, candidates]);
  const pendingApplications = useMemo(() => candidateRows.filter((row) => row.source === 'application' && row.status === 'pending'), [candidateRows]);
  const [reviewRowId, setReviewRowId] = useState(null);
  const [fullView, setFullView] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [newElectionOpen, setNewElectionOpen] = useState(false);
  const [newElectionForm, setNewElectionForm] = useState({
    title: '',
    academicYear: '',
    startsAt: '',
    endsAt: '',
    keepApprovedVoters: true,
    reopenCandidateApplications: true
  });
  const [voterFilters, setVoterFilters] = useState({ search: '', status: 'all', department: 'all' });
  const [candidateFilters, setCandidateFilters] = useState({ search: '', status: 'all', position: 'all', department: 'all' });
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerPage, setLedgerPage] = useState(1);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [resetApprovalModal, setResetApprovalModal] = useState(null);
  const [temporaryPasswordModal, setTemporaryPasswordModal] = useState(null);
  const [resetPasswordVisible, setResetPasswordVisible] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [candidatePhotoCache, setCandidatePhotoCache] = useState({});
  const [voterPage, setVoterPage] = useState(1);
  const [candidatePage, setCandidatePage] = useState(1);

  useEffect(() => {
    if (!election) return;
    setSettings({
      title: election.title || 'Votechain Election',
      startsAt: toLocalInput(election.starts_at),
      endsAt: toLocalInput(election.ends_at)
    });
  }, [election]);

  async function run(action, successText) {
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      await action();
      await refresh();
      setSuccess(successText);
    } catch (err) {
      console.error('[admin] operation failed', err);
      setError(err.message || 'Operation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function saveVoter() {
    await run(async () => {
      await upsertVoter(voterForm);
      setVoterForm({ full_name: '', matric: '', department: '', level: '', email: '', status: 'pending', auth_user_id: '' });
    }, 'Voter saved.');
  }

  async function submitNewElection(event) {
    event.preventDefault();
    await run(async () => {
      await createNewElectionCycle({
        ...newElectionForm,
        startsAt: newElectionForm.startsAt ? new Date(newElectionForm.startsAt).toISOString() : null,
        endsAt: newElectionForm.endsAt ? new Date(newElectionForm.endsAt).toISOString() : null
      });
      setNewElectionOpen(false);
      setNewElectionForm({
        title: '',
        academicYear: '',
        startsAt: '',
        endsAt: '',
        keepApprovedVoters: true,
        reopenCandidateApplications: true
      });
    }, 'New election cycle created successfully.');
  }

  const reviewCandidate = candidateRows.find((row) => row.row_id === reviewRowId) || null;
  const reviewPhotoUrl = reviewCandidate?.photo_url || '';

  const markCandidatePhotoState = (url, state) => {
    if (!url) return;
    setCandidatePhotoCache((current) => {
      const currentEntry = current[url] || { status: 'idle', resolvedUrl: url };
      if (currentEntry.status === state) return current;
      return { ...current, [url]: { ...currentEntry, status: state } };
    });
  };

  useEffect(() => {
    if (!reviewPhotoUrl) return undefined;
    setCandidatePhotoCache((current) => {
      if (current[reviewPhotoUrl]?.resolvedUrl) return current;
      return {
        ...current,
        [reviewPhotoUrl]: { status: current[reviewPhotoUrl]?.status || 'idle', resolvedUrl: reviewPhotoUrl }
      };
    });
    const reviewUrl = reviewPhotoUrl;
    const timer = window.setTimeout(() => {
      setCandidatePhotoCache((current) => {
        const entry = current[reviewUrl];
        if (!entry || entry.status === 'loaded' || entry.status === 'error') return current;
        return { ...current, [reviewUrl]: { ...entry, status: 'slow' } };
      });
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [reviewPhotoUrl]);

  function updateCandidateRowStatus(row, status) {
    const reason = status === 'rejected' ? window.prompt('Enter rejection reason for this candidate:') || '' : '';
    if (row.row_type === 'application') return updateApplicationStatus(row.application_id, status, reason);
    return updateCandidateStatus(row.candidate_id, status, reason);
  }

  function updateVoterStatusWithReason(id, status) {
    const reason = status === 'rejected' ? window.prompt('Enter rejection reason for this voter:') || '' : '';
    return updateVoterStatus(id, status, reason);
  }

  async function removeCandidateRow(row) {
    console.error('[admin] deleting candidate row', {
      source: row.source,
      candidateId: row.candidate_id,
      applicationId: row.application_id,
      electionStatus
    });
    if (row.source === 'application') {
      await deleteCandidateApplication(row.application_id);
      return;
    }
    await deleteCandidate(row.candidate_id);
  }

  function requestDelete(type, item) {
    console.error('[admin] delete requested', {
      type,
      id: item?.id,
      candidateId: item?.candidate_id,
      applicationId: item?.application_id,
      source: item?.source,
      electionStatus
    });
    setDeleteTarget({ type, item });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await run(async () => {
      if (deleteTarget.type === 'voter') {
        console.error('[admin] deleting voter row', {
          voterId: deleteTarget.item.id,
          electionStatus
        });
        await deleteVoter(deleteTarget.item.id);
        removeVoterLocal?.(deleteTarget.item.id);
      }
      if (deleteTarget.type === 'candidate') {
        await removeCandidateRow(deleteTarget.item);
        removeCandidateLocal?.({
          candidateId: deleteTarget.item.source === 'candidate' ? deleteTarget.item.candidate_id : null,
          applicationId: deleteTarget.item.source === 'application' ? deleteTarget.item.application_id : null
        });
      }
      setDeleteTarget(null);
    }, deleteTarget.type === 'voter' ? 'Voter removed.' : 'Candidate removed.');
  }

  function openPasswordResetApproval(request) {
    setResetApprovalModal({ request, temporaryPassword: '' });
    setResetPasswordVisible(false);
    setResetPasswordError('');
  }

  function updateResetTemporaryPassword(value) {
    setResetApprovalModal((current) => current ? { ...current, temporaryPassword: value } : current);
    setResetPasswordError('');
  }

  async function copyTemporaryPassword(value) {
    await navigator.clipboard?.writeText(value);
    setToast('Temporary password copied');
  }

  async function approvePasswordResetRequest() {
    if (!resetApprovalModal) return;
    const request = resetApprovalModal.request;
    const voter = request.voters || {};
    const temporaryPassword = String(resetApprovalModal.temporaryPassword || '').trim();
    const validationError = validateTemporaryPassword(temporaryPassword, voter);
    if (validationError) {
      setResetPasswordError(validationError);
      return;
    }
    await run(async () => {
      const result = await approveVoterPasswordReset(request.id, temporaryPassword);
      setResetApprovalModal(null);
      setTemporaryPasswordModal({
        email: result?.email || request.voters?.email || 'N/A',
        temporaryPassword
      });
    }, 'Temporary password generated successfully.');
  }

  function rejectPasswordResetRequest(request) {
    const reason = window.prompt('Enter rejection reason for this password reset request:') || '';
    return rejectVoterPasswordReset(request.id, reason);
  }

  function settingsPayload(status) {
    return {
      title: settings.title,
      status,
      startsAt: settings.startsAt ? new Date(settings.startsAt).toISOString() : null,
      endsAt: settings.endsAt ? new Date(settings.endsAt).toISOString() : null
    };
  }

  function startPayload() {
    const startsAt = new Date();
    const configuredEnd = settings.endsAt ? new Date(settings.endsAt) : null;
    return {
      ...settingsPayload('active'),
      startsAt: startsAt.toISOString(),
      endsAt: configuredEnd && configuredEnd > startsAt ? configuredEnd.toISOString() : null
    };
  }

  function endPayload() {
    return {
      ...settingsPayload('ended'),
      endsAt: new Date().toISOString()
    };
  }

  function finalizePayload() {
    return {
      ...settingsPayload('finalized'),
      endsAt: settings.endsAt ? new Date(settings.endsAt).toISOString() : new Date().toISOString()
    };
  }

  const phase = getElectionPhase(election, now);
  const electionStatus = String(election?.status || 'inactive').toLowerCase();
  const countdown = getElectionCountdown(election, phase, now);
  const canSaveElection = perms.canControlElection && !busy;
  const canStartElection = perms.canControlElection && !busy && ['standby', 'inactive'].includes(phase);
  const canEndElection = perms.canControlElection && !busy && phase === 'active';
  const canSetInactive = perms.canControlElection && !busy && phase !== 'finalized';
  const canFinalizeElection = perms.canFinalizeElection && !busy && phase === 'ended';
  const canResetElection = perms.canResetElection && !busy && phase !== 'finalized';
  const canShowCreateElection = perms.canCreateElectionCycle
    && (['ended', 'finalized'].includes(phase) || ['ended', 'finalized'].includes(electionStatus) || election?.ledger_status === 'finalized');
  const canCreateElection = canShowCreateElection && !busy;
  const canDeleteVoters = perms.canDeleteRecords && !busy && ['inactive', 'standby'].includes(electionStatus);
  const canDeleteCandidates = perms.canDeleteRecords && !busy && ['inactive', 'standby'].includes(electionStatus);
  const canEditElectionSettings = perms.canEditElectionSettings && !busy;
  const canApproveCandidateActions = perms.canApproveApplications && !busy && ['inactive', 'standby'].includes(electionStatus);
  const recentVoters = useMemo(() => voters.slice(0, 6), [voters]);
  const recentCandidateRows = useMemo(() => candidateRows.slice(0, 6), [candidateRows]);
  const voterDepartments = useMemo(() => Array.from(new Set(voters.map((voter) => voter.department).filter(Boolean))).sort(), [voters]);
  const candidateDepartments = useMemo(() => Array.from(new Set(candidateRows.map((row) => row.department).filter(Boolean))).sort(), [candidateRows]);
  const candidatePositions = useMemo(() => currentPositions.map((position) => ({ id: position.id, title: getWuccPositionTitle(position) })), [currentPositions]);
  const filteredVoters = useMemo(() => {
    const query = voterFilters.search.trim().toLowerCase();
    return voters.filter((voter) => {
      const text = [voter.full_name, voter.matric, voter.email, voter.department, voter.level].join(' ').toLowerCase();
      return (!query || text.includes(query))
        && (voterFilters.status === 'all' || voter.status === voterFilters.status)
        && (voterFilters.department === 'all' || voter.department === voterFilters.department);
    });
  }, [voters, voterFilters]);
  const filteredCandidateRows = useMemo(() => {
    const query = candidateFilters.search.trim().toLowerCase();
    return candidateRows.filter((row) => {
      const position = positionLabel(row.position_id);
      const text = [row.full_name, row.matric, row.email, row.department, row.level, position].join(' ').toLowerCase();
      return (!query || text.includes(query))
        && (candidateFilters.status === 'all' || row.status === candidateFilters.status)
        && (candidateFilters.department === 'all' || row.department === candidateFilters.department)
        && (candidateFilters.position === 'all' || row.position_id === candidateFilters.position);
    });
  }, [candidateRows, candidateFilters, positionTitleById]);
  const voterPageCount = Math.max(1, Math.ceil(filteredVoters.length / 10));
  const candidatePageCount = Math.max(1, Math.ceil(filteredCandidateRows.length / 10));
  const filteredLedger = useMemo(() => {
    const query = ledgerSearch.trim().toLowerCase();
    if (!query) return ledger;
    return ledger.filter((block) => [block.block_number, block.receipt_hash, block.block_hash, block.previous_hash, block.validation_status, block.anonymous_verification_id].join(' ').toLowerCase().includes(query));
  }, [ledger, ledgerSearch]);
  const ledgerPageCount = Math.max(1, Math.ceil(filteredLedger.length / 8));
  const pagedVoters = filteredVoters.slice((voterPage - 1) * 10, voterPage * 10);
  const pagedCandidateRows = filteredCandidateRows.slice((candidatePage - 1) * 10, candidatePage * 10);
  const pagedLedger = filteredLedger.slice((ledgerPage - 1) * 8, ledgerPage * 8);
  const turnoutPercentage = approved ? Math.round((voted / approved) * 1000) / 10 : 0;
  const candidatesPerPosition = currentPositions.map((position) => ({
    position,
    count: candidateRows.filter((row) => row.position_id === position.id).length
  }));
  const mostContested = [...candidatesPerPosition].sort((a, b) => b.count - a.count)[0];
  const chainPreview = useMemo(() => [...ledger].sort((a, b) => Number(a.block_number || 0) - Number(b.block_number || 0)).slice(-6), [ledger]);

  useEffect(() => {
    setVoterPage(1);
  }, [voterFilters]);

  useEffect(() => {
    setCandidatePage(1);
  }, [candidateFilters]);

  useEffect(() => {
    setLedgerPage(1);
  }, [ledgerSearch]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Administration</p>
          <h1 className="text-3xl font-black tracking-tight">Votechain control center</h1>
          <p className="mt-1 text-sm text-slate-500">Signed in as {profile?.full_name}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className={`badge ${perms.role === 'superadmin' ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-100' : perms.role === 'commissioner' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
              {roleLabel(profile?.role)}
            </span>
            {perms.role === 'commissioner' && <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">Election officer under Super Admin authority</span>}
          </div>
          {perms.readOnly && <p className="mt-1 text-sm font-semibold text-amber-600 dark:text-amber-300">Observer access is read-only.</p>}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Registered" value={voters.length} />
        <StatCard title="Approved" value={approved} tone="green" />
        <StatCard title="Pending" value={pending} tone="amber" />
        <StatCard title="Voted" value={voted} tone="slate" />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <div className="card p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Turnout</p><p className="mt-2 text-2xl font-black">{turnoutPercentage}%</p></div>
        <div className="card p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Approved voters</p><p className="mt-2 text-2xl font-black">{approved}</p></div>
        <div className="card p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Voted voters</p><p className="mt-2 text-2xl font-black">{voted}</p></div>
        <div className="card p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Most contested</p><p className="mt-2 truncate text-lg font-black">{mostContested?.count ? getWuccPositionTitle(mostContested.position) : 'N/A'}</p><p className="text-xs text-slate-500">{mostContested?.count || 0} candidates</p></div>
      </div>
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Election timer</p>
            <h2 className="text-xl font-black tracking-tight">{getPhaseLabel(phase)}</h2>
          </div>
          <span className={`badge ${getPhaseBadgeClass(phase)}`}>{phase === 'finalized' ? <ShieldCheck size={14} /> : null}{phase === 'finalized' ? 'Ledger finalized' : phase === 'inactive' ? 'Voting disabled' : countdown.text}</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="text-xs text-slate-500">Starts</p><p className="font-bold">{election?.starts_at ? new Date(election.starts_at).toLocaleString() : 'Not set'}</p></div>
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="text-xs text-slate-500">Ends</p><p className="font-bold">{election?.ends_at ? new Date(election.ends_at).toLocaleString() : 'Not set'}</p></div>
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="text-xs text-slate-500">Ledger</p><p className="font-bold">{phase === 'finalized' ? 'Finalized' : phase === 'ended' ? 'Ready to finalize' : 'Open'}</p></div>
        </div>
      </div>
      <StatusMessage>{error}</StatusMessage>
      <StatusMessage type="success">{success}</StatusMessage>

      {dataError && <StatusMessage>{dataError}</StatusMessage>}

      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold"><Blocks size={18} />Consortium blockchain ledger</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">PBFT-confirmed blocks linked by previous hash.</p>
          </div>
          <span className={`badge ${phase === 'finalized' ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-100' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100'}`}>
            {phase === 'finalized' ? <ShieldCheck size={14} /> : null}{phase === 'finalized' ? 'Ledger Finalized' : 'Ledger synchronized'}
          </span>
        </div>
        {chainPreview.length > 0 && (
          <div className="mb-5 overflow-x-auto pb-2">
            <div className="flex min-w-max items-stretch gap-3">
              {chainPreview.map((block, index) => (
                <div key={block.id || block.receipt_hash || block.block_number} className="flex items-center gap-3">
                  <div className="w-64 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="font-black">Block #{block.block_number}</span>
                      <span className="badge bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">{block.confirmation_count || 0}/5 PBFT</span>
                    </div>
                    <p className="truncate font-mono text-xs text-slate-500">Prev: {block.previous_hash || 'genesis'}</p>
                    <p className="truncate font-mono text-xs text-slate-500">Hash: {block.block_hash}</p>
                    <p className="truncate font-mono text-xs text-slate-500">Receipt: {block.receipt_hash}</p>
                  </div>
                  {index < chainPreview.length - 1 && <div className="h-px w-8 bg-slate-300 dark:bg-slate-700" />}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mb-4 max-w-md">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input className="input pl-9" placeholder="Search receipt, block hash, previous hash" value={ledgerSearch} onChange={(event) => setLedgerSearch(event.target.value)} />
          </div>
        </div>
        <div className="table-wrap">
          <table className="table min-w-[900px]">
            <thead><tr><th>Block</th><th>Previous hash</th><th>Current hash</th><th>Receipt</th><th>Validators</th><th>Status</th><th>Timestamp</th><th></th></tr></thead>
            <tbody>
              {pagedLedger.length ? pagedLedger.map((block) => (
                <tr key={block.id || block.receipt_hash}>
                  <td className="font-bold">#{block.block_number}</td>
                  <td className="max-w-[160px] truncate font-mono text-xs">{block.previous_hash || 'genesis'}</td>
                  <td className="max-w-[160px] truncate font-mono text-xs">{block.block_hash}</td>
                  <td className="max-w-[180px] truncate font-mono text-xs">{block.receipt_hash}</td>
                  <td>{block.confirmation_count || 0}/5</td>
                  <td><span className="badge bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">{block.validation_status || 'pbft_confirmed'}</span></td>
                  <td>{compactDate(block.created_at)}</td>
                  <td><button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" onClick={() => setSelectedBlock(block)}><Eye size={15} />View</button></td>
                </tr>
              )) : (
                <tr><td colSpan={8}><div className="py-6 text-center text-sm text-slate-500">No ledger blocks found.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-slate-500 dark:text-slate-400">Page {ledgerPage} of {ledgerPageCount}</span>
          <div className="flex gap-2">
            <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={ledgerPage <= 1} onClick={() => setLedgerPage((page) => Math.max(1, page - 1))}>Previous</button>
            <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={ledgerPage >= ledgerPageCount} onClick={() => setLedgerPage((page) => Math.min(ledgerPageCount, page + 1))}>Next</button>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Audit log</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Admin and ledger actions recorded for defense review.</p>
          </div>
          <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{auditLogs.length} events</span>
        </div>
        <div className="table-wrap">
          <table className="table min-w-[900px]">
            <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
            <tbody>
              {auditLogs.slice(0, 12).length ? auditLogs.slice(0, 12).map((log) => (
                <tr key={log.id}>
                  <td>{compactDate(log.created_at)}</td>
                  <td className="max-w-[180px] truncate">{log.actor_role || 'system'}{log.actor_id ? ` / ${log.actor_id}` : ''}</td>
                  <td><span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{log.action}</span></td>
                  <td className="font-mono text-xs">{log.record_table || 'ledger'} {log.record_id ? String(log.record_id).slice(0, 8) : ''}</td>
                  <td className="max-w-[260px] truncate text-sm text-slate-500">{log.details ? JSON.stringify(log.details) : 'N/A'}</td>
                </tr>
              )) : (
                <tr><td colSpan={5}><div className="py-6 text-center text-sm text-slate-500">No audit events recorded yet.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pendingVoters.length > 0 && !perms.readOnly && (
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Pending voter registration</h2>
            <span className="badge bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-100">{pendingVoters.length} pending</span>
          </div>
          <div className="space-y-3 md:hidden">
            {passwordResetRequests.slice(0, 10).map((request) => {
              const voter = request.voters || {};
              return (
              <div key={`mobile-reset-${request.id}`} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="grid grid-cols-2 gap-3">
                  <MobileDetail label="Name" value={voter.full_name || 'Approved voter'} />
                  <MobileDetail label="Matric" value={voter.matric} />
                  <MobileDetail label="Department" value={voter.department} />
                  <MobileDetail label="Requested" value={compactDate(request.created_at)} />
                  <MobileDetail label="Status" value={request.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!perms.canManageVoters || busy || request.status !== 'pending'} onClick={() => openPasswordResetApproval(request)}><Check size={15} />Approve</button>
                  <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!perms.canManageVoters || busy || request.status !== 'pending'} onClick={() => run(() => rejectPasswordResetRequest(request), 'Password reset request rejected.')}><X size={15} />Reject</button>
                </div>
              </div>
              );
            })}
          </div>
          <div className="hidden w-full max-w-full overflow-hidden md:block">
            <div
              className="admin-table-scroll w-full overflow-x-auto overflow-y-hidden rounded-xl border border-slate-700"
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x', maxWidth: '100vw' }}
            >
              <table className="table admin-wide-table min-w-[1200px] table-fixed">
              <colgroup><col className="w-[220px]" /><col className="w-[130px]" /><col className="w-[220px]" /><col className="w-[220px]" /><col className="w-[320px]" /></colgroup>
              <thead><tr><th>Name</th><th>Matric</th><th>Email</th><th>Department</th><th>Action</th></tr></thead>
              <tbody>
                {pendingVoters.map((voter) => (
                  <tr key={voter.id}>
                    <td className="px-4 py-4 align-middle whitespace-nowrap"><div className="max-w-[220px] truncate font-semibold">{voter.full_name}</div></td>
                    <td>{voter.matric}</td>
                    <td className="px-4 py-4 align-middle whitespace-nowrap"><div className="max-w-[220px] truncate">{voter.email}</div></td>
                    <td className="px-4 py-4 align-middle whitespace-nowrap"><div className="max-w-[220px] truncate">{voter.department}</div></td>
                    <td className="px-4 py-4 align-middle whitespace-nowrap">
                      <div className="flex items-center gap-3 whitespace-nowrap">
                        <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!perms.canManageVoters || busy} onClick={() => run(() => updateVoterStatusWithReason(voter.id, 'approved'), 'Voter registration approved.')}><Check size={15} />Approve</button>
                        <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!perms.canManageVoters || busy} onClick={() => run(() => updateVoterStatusWithReason(voter.id, 'rejected'), 'Voter registration rejected.')}><X size={15} />Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
            <p className="mt-2 hidden text-xs font-semibold text-slate-500 dark:text-slate-400 md:block">
              Swipe left/right to view all columns and actions.
            </p>
          </div>
        </div>
      )}

      {passwordResetRequests.length > 0 && !perms.readOnly && (
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold"><KeyRound size={18} />Pending password resets</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Approve matched voter reset requests. Approval generates a one-time temporary password and requires a private password change on next login.</p>
            </div>
            <span className="badge bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-100">{pendingPasswordResetRequests.length} pending</span>
          </div>
          <div className="space-y-3 md:hidden">
            {pendingVoters.map((voter) => (
              <div key={`mobile-pending-${voter.id}`} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="grid grid-cols-2 gap-3">
                  <MobileDetail label="Name" value={voter.full_name} />
                  <MobileDetail label="Matric" value={voter.matric} />
                  <MobileDetail label="Department" value={voter.department} />
                  <MobileDetail label="Level" value={voter.level} />
                  <MobileDetail label="Email" value={voter.email} />
                  <MobileDetail label="Status" value={voter.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!perms.canManageVoters || busy} onClick={() => run(() => updateVoterStatusWithReason(voter.id, 'approved'), 'Voter registration approved.')}><Check size={15} />Approve</button>
                  <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!perms.canManageVoters || busy} onClick={() => run(() => updateVoterStatusWithReason(voter.id, 'rejected'), 'Voter registration rejected.')}><X size={15} />Reject</button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden w-full max-w-full overflow-hidden md:block">
            <div
              className="admin-table-scroll w-full overflow-x-auto overflow-y-hidden rounded-xl border border-slate-700"
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x', maxWidth: '100vw' }}
            >
              <table className="table admin-wide-table min-w-[1200px] table-fixed">
              <colgroup><col className="w-[220px]" /><col className="w-[130px]" /><col className="w-[220px]" /><col className="w-[180px]" /><col className="w-[140px]" /><col className="w-[320px]" /></colgroup>
              <thead><tr><th>Name</th><th>Matric</th><th>Department</th><th>Requested</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {passwordResetRequests.slice(0, 10).map((request) => {
                  const voter = request.voters || {};
                  return (
                    <tr key={request.id}>
                      <td className="px-4 py-4 align-middle whitespace-nowrap"><div className="max-w-[210px] truncate">{voter.full_name || 'Approved voter'}</div></td>
                      <td className="px-4 py-4 align-middle whitespace-nowrap">{voter.matric || 'N/A'}</td>
                      <td className="px-4 py-4 align-middle whitespace-nowrap"><div className="max-w-[180px] truncate">{voter.department || 'N/A'}</div></td>
                      <td className="px-4 py-4 align-middle whitespace-nowrap">{compactDate(request.created_at)}</td>
                      <td className="px-4 py-4 align-middle whitespace-nowrap"><span className={`badge inline-flex shrink-0 whitespace-nowrap capitalize ${statusBadgeClass(request.status)}`}>{request.status}</span></td>
                      <td className="px-4 py-4 align-middle whitespace-nowrap">
                        <div className="flex items-center gap-3 whitespace-nowrap">
                          <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!perms.canManageVoters || busy || request.status !== 'pending'} onClick={() => openPasswordResetApproval(request)}><Check size={15} />Approve</button>
                          <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!perms.canManageVoters || busy || request.status !== 'pending'} onClick={() => run(() => rejectPasswordResetRequest(request), 'Password reset request rejected.')}><X size={15} />Reject</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
            <p className="mt-2 hidden text-xs font-semibold text-slate-500 dark:text-slate-400 md:block">
              Swipe left/right to view all columns and actions.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
        {perms.canControlElection && (
        <div className="card max-w-full overflow-hidden p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Election control</h2>
            <span className={`badge ${getPhaseBadgeClass(phase)}`}>
              {getPhaseLabel(phase)}
            </span>
          </div>
          <div className="mt-4 space-y-5">
            <label className="block w-full"><span className="label">Election title</span><input className="input w-full" disabled={!perms.canEditElectionSettings} value={settings.title} onChange={(e) => setSettings({ ...settings, title: e.target.value })} /></label>
            <label className="block w-full"><span className="label">Start date</span><input type="datetime-local" className="input w-full" disabled={!perms.canEditElectionSettings} value={settings.startsAt} onChange={(e) => setSettings({ ...settings, startsAt: e.target.value })} /></label>
            <label className="block w-full"><span className="label">End date</span><input type="datetime-local" className="input w-full" disabled={!perms.canEditElectionSettings} value={settings.endsAt} onChange={(e) => setSettings({ ...settings, endsAt: e.target.value })} /></label>
            {perms.role === 'commissioner' && (
              <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
                Commissioner controls are limited to start, pause, end, approvals, and monitoring. Finalization and new election cycles remain Super Admin controls.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button className="btn-primary" disabled={!canStartElection} onClick={() => run(() => saveElectionSettings(startPayload()), 'Election started. Voting is enabled and ledger is open.')}><Play size={17} />Start</button>
              <button className="btn-secondary" disabled={!canEndElection} onClick={() => run(() => saveElectionSettings(endPayload()), 'Election ended. Voting is disabled and ledger remains reviewable.')}><Square size={17} />End</button>
              {perms.canEditElectionSettings && <button className="btn-secondary" disabled={!canEditElectionSettings} onClick={() => run(() => saveElectionSettings(settingsPayload(election?.status || 'inactive')), 'Election settings saved.')}><Save size={17} />Save</button>}
              <button className="btn-secondary" disabled={!canSetInactive} onClick={() => run(() => saveElectionSettings(settingsPayload('inactive')), 'Election marked inactive. Voting is disabled.')}><Square size={17} />Inactive</button>
              {perms.canFinalizeElection && <button className="btn-secondary" disabled={!canFinalizeElection} onClick={() => run(() => saveElectionSettings(finalizePayload()), 'Blockchain ledger finalized. Results are final.')}><ShieldCheck size={17} />Finalize</button>}
              {canShowCreateElection && (
                <button className="btn-primary col-span-2" disabled={!canCreateElection} onClick={() => setNewElectionOpen(true)}><PlusCircle size={17} />Create New Election</button>
              )}
              {perms.canResetElection && (
                <button className="btn-danger" disabled={!canResetElection} onClick={() => setResetConfirm(true)}><RefreshCcw size={17} />Reset</button>
              )}
            </div>
            {phase === 'finalized' && (
              <p className="rounded-lg bg-brand-50 p-3 text-sm font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-100">
                This finalized ledger is locked. Create a new election cycle to run another election.
              </p>
            )}
          </div>
          <p className="mt-2 hidden text-xs font-medium text-slate-500 dark:text-slate-400">Swipe horizontally to view all voter columns.</p>
        </div>
        )}

        {perms.canManageVoters && (
        <div className="card p-5">
          <div>
            <h2 className="text-lg font-bold">Add or approve voter</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Approved voters sign in with email and password.</p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label>
              <span className="label">Full name</span>
              <input className="input" placeholder="Enter full name" value={voterForm.full_name} onChange={(e) => setVoterForm({ ...voterForm, full_name: e.target.value })} />
            </label>
            <label>
              <span className="label">Matric number</span>
              <input className="input" placeholder="COSC/21045" value={voterForm.matric} onChange={(e) => setVoterForm({ ...voterForm, matric: e.target.value })} />
            </label>
            <label>
              <span className="label">Department</span>
              <select className="input" value={voterForm.department} onChange={(e) => setVoterForm({ ...voterForm, department: e.target.value })}>
                <option value="">Select department</option>
                {departmentOptions.map((department) => <option key={department} value={department}>{department}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Level</span>
              <select className="input" value={voterForm.level} onChange={(e) => setVoterForm({ ...voterForm, level: e.target.value })}>
                <option value="">Select level</option>
                {levelOptions.map((level) => <option key={level} value={level}>{level}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Email address</span>
              <input className="input" type="email" placeholder="voter@example.com" value={voterForm.email} onChange={(e) => setVoterForm({ ...voterForm, email: e.target.value })} />
            </label>
            <label>
              <span className="label">Auth user UUID</span>
              <input className="input" placeholder="Optional for voters" value={voterForm.auth_user_id} onChange={(e) => setVoterForm({ ...voterForm, auth_user_id: e.target.value })} />
            </label>
            <label>
              <span className="label">Status</span>
              <select className="input" value={voterForm.status} onChange={(e) => setVoterForm({ ...voterForm, status: e.target.value })}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
            <button type="button" className="btn-primary self-end" disabled={!perms.canManageVoters || busy} onClick={saveVoter}><UserPlus size={17} />{busy ? 'Saving...' : 'Save voter'}</button>
          </div>
        </div>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {perms.canManageVoters && (
        <div className="card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Voters</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{voters.length} records</span>
              <button type="button" className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" onClick={() => setFullView('voters')}><Eye size={15} />View all voters</button>
            </div>
          </div>
          <div className="space-y-3 md:hidden">
            {pendingVoters.map((voter) => (
              <div key={`mobile-pending-${voter.id}`} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="grid grid-cols-2 gap-3">
                  <MobileDetail label="Name" value={voter.full_name} />
                  <MobileDetail label="Matric" value={voter.matric} />
                  <MobileDetail label="Department" value={voter.department} />
                  <MobileDetail label="Level" value={voter.level} />
                  <MobileDetail label="Email" value={voter.email} />
                  <MobileDetail label="Status" value={voter.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!perms.canManageVoters || busy} onClick={() => run(() => updateVoterStatusWithReason(voter.id, 'approved'), 'Voter registration approved.')}><Check size={15} />Approve</button>
                  <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!perms.canManageVoters || busy} onClick={() => run(() => updateVoterStatusWithReason(voter.id, 'rejected'), 'Voter registration rejected.')}><X size={15} />Reject</button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden w-full max-w-full overflow-hidden md:block">
            <div
              className="admin-table-scroll w-full overflow-x-auto overflow-y-hidden rounded-xl border border-slate-700"
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x', maxWidth: '100vw' }}
            >
              <table className="table admin-wide-table min-w-[1200px] table-fixed">
              <colgroup><col className="w-[220px]" /><col className="w-[130px]" /><col className="w-[200px]" /><col className="w-[240px]" /><col className="w-[140px]" /><col className="w-[340px]" /></colgroup>
              <thead><tr><th>Name</th><th>Matric</th><th>Department</th><th>Email</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {dataLoading && (
                  <tr><td colSpan={6}><div className="flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin" size={16} />Loading voters...</div></td></tr>
                )}
                {!dataLoading && voters.length === 0 && (
                  <tr><td colSpan={6}><div className="py-6 text-center text-sm text-slate-500">No voter records found.</div></td></tr>
                )}
                {!dataLoading && recentVoters.map((voter) => (
                  <tr key={voter.id}>
                    <td className="px-4 py-4 align-middle whitespace-nowrap"><div className="max-w-[220px] truncate font-semibold">{voter.full_name}</div><div className="text-xs text-slate-500">{voter.level || 'Level not set'}</div></td>
                    <td className="px-4 py-4 align-middle whitespace-nowrap font-mono text-xs">{voter.matric}</td>
                    <td className="px-4 py-4 align-middle whitespace-nowrap"><div className="max-w-[220px] truncate">{voter.department || 'N/A'}</div></td>
                    <td className="px-4 py-4 align-middle whitespace-nowrap"><div className="max-w-[220px] truncate">{voter.email || 'N/A'}</div></td>
                    <td className="px-4 py-4 align-middle whitespace-nowrap"><span className={`badge inline-flex shrink-0 whitespace-nowrap capitalize ${statusBadgeClass(voter.status)}`}>{voter.status}</span></td>
                    <td className="px-4 py-4 align-middle whitespace-nowrap">
                      <div className="flex items-center gap-3 whitespace-nowrap">
                        <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!perms.canManageVoters || busy} onClick={() => run(() => updateVoterStatusWithReason(voter.id, 'approved'), 'Voter approved.')}><Check size={15} />Approve</button>
                        <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!perms.canManageVoters || busy} onClick={() => run(() => updateVoterStatusWithReason(voter.id, 'rejected'), 'Voter rejected.')}><X size={15} />Reject</button>
                        <button className="btn-danger min-h-9 shrink-0 px-3 py-1.5" disabled={!canDeleteVoters} onClick={() => requestDelete('voter', voter)} title={canDeleteVoters ? 'Remove voter' : 'Delete is disabled after election starts'}><Trash2 size={15} />Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
            <p className="mt-2 hidden text-xs font-semibold text-slate-500 dark:text-slate-400 md:block">
              Swipe left/right to view all columns and actions.
            </p>
          </div>
        </div>
        )}

        <div className="card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Candidate management</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{candidateRows.length} total</span>
              <button type="button" className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" onClick={() => setFullView('candidates')}><Eye size={15} />View all candidates</button>
            </div>
          </div>
          <div className="space-y-3 md:hidden">
            {pendingVoters.map((voter) => (
              <div key={`mobile-pending-${voter.id}`} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="grid grid-cols-2 gap-3">
                  <MobileDetail label="Name" value={voter.full_name} />
                  <MobileDetail label="Matric" value={voter.matric} />
                  <MobileDetail label="Department" value={voter.department} />
                  <MobileDetail label="Level" value={voter.level} />
                  <MobileDetail label="Email" value={voter.email} />
                  <MobileDetail label="Status" value={voter.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!perms.canManageVoters || busy} onClick={() => run(() => updateVoterStatusWithReason(voter.id, 'approved'), 'Voter registration approved.')}><Check size={15} />Approve</button>
                  <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!perms.canManageVoters || busy} onClick={() => run(() => updateVoterStatusWithReason(voter.id, 'rejected'), 'Voter registration rejected.')}><X size={15} />Reject</button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden w-full max-w-full overflow-hidden md:block">
            <div
              className="admin-table-scroll w-full overflow-x-auto overflow-y-hidden rounded-xl border border-slate-700"
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x', maxWidth: '100vw' }}
            >
              <table className="table admin-wide-table min-w-[1200px] table-fixed">
              <colgroup><col className="w-[220px]" /><col className="w-[220px]" /><col className="w-[200px]" /><col className="w-[90px]" /><col className="w-[90px]" /><col className="w-[140px]" /><col className="w-[180px]" /><col className="w-[110px]" /><col className="w-[360px]" /></colgroup>
              <thead><tr><th>Name</th><th>Position</th><th>Department</th><th>Level</th><th>CGPA</th><th>Status</th><th>Submitted</th><th>Source</th><th>Actions</th></tr></thead>
              <tbody>
                {dataLoading && (
                  <tr><td colSpan={9}><div className="flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin" size={16} />Loading candidates...</div></td></tr>
                )}
                {!dataLoading && candidateRows.length === 0 && (
                  <tr><td colSpan={9}><div className="py-6 text-center text-sm text-slate-500">No candidate records found.</div></td></tr>
                )}
                {!dataLoading && recentCandidateRows.map((row) => (
                  <tr key={row.row_id}>
                    <td className="px-4 py-4 align-middle whitespace-nowrap"><div className="max-w-[210px] truncate font-semibold">{row.full_name}</div><div className="font-mono text-xs text-slate-500">{row.matric || 'N/A'}</div></td>
                    <td className="px-4 py-4 align-middle whitespace-nowrap"><div className="max-w-[200px] truncate">{positionLabel(row.position_id)}</div></td>
                    <td className="px-4 py-4 align-middle whitespace-nowrap"><div className="max-w-[170px] truncate">{row.department || 'N/A'}</div></td>
                    <td className="px-4 py-4 align-middle whitespace-nowrap">{row.level || 'N/A'}</td>
                    <td className="px-4 py-4 align-middle whitespace-nowrap">{row.cgpa || 'N/A'}</td>
                    <td className="px-4 py-4 align-middle whitespace-nowrap"><span className={`badge inline-flex shrink-0 whitespace-nowrap capitalize ${statusBadgeClass(row.status)}`}>{row.status || 'pending'}</span></td>
                    <td className="px-4 py-4 align-middle whitespace-nowrap">{row.submitted_at ? new Date(row.submitted_at).toLocaleString() : 'N/A'}</td>
                    <td className="px-4 py-4 align-middle whitespace-nowrap"><span className="badge inline-flex shrink-0 whitespace-nowrap bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{row.source}</span></td>
                    <td className="px-4 py-4 align-middle whitespace-nowrap">
                      <div className="flex items-center gap-3 whitespace-nowrap">
                        <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={busy} onClick={() => setReviewRowId(row.row_id)}><Eye size={15} />View</button>
                        <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!canApproveCandidateActions} onClick={() => run(() => updateCandidateRowStatus(row, 'approved'), 'Candidate approved.')}><Check size={15} />Approve</button>
                        <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!canApproveCandidateActions} onClick={() => run(() => updateCandidateRowStatus(row, 'rejected'), 'Candidate rejected.')}><X size={15} />Reject</button>
                        <button className="btn-danger min-h-9 shrink-0 px-3 py-1.5" disabled={!canDeleteCandidates} onClick={() => requestDelete('candidate', row)} title={canDeleteCandidates ? 'Remove candidate' : 'Delete is disabled after election starts'}><Trash2 size={15} />Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
            <p className="mt-2 hidden text-xs font-semibold text-slate-500 dark:text-slate-400 md:block">
              Swipe left/right to view all columns and actions.
            </p>
          </div>
        </div>
      </div>

      {fullView === 'voters' && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="card flex max-h-[92vh] w-full max-w-7xl flex-col p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">All voters</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">{filteredVoters.length} of {voters.length} records shown</p>
              </div>
              <button className="btn-secondary px-3 py-2" onClick={() => setFullView(null)}>Close</button>
            </div>
            <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px_220px]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-9 text-slate-400" size={17} />
                <span className="label">Search</span>
                <input className="input pl-10" placeholder="Name, matric, email, department" value={voterFilters.search} onChange={(event) => setVoterFilters({ ...voterFilters, search: event.target.value })} />
              </label>
              <label>
                <span className="label">Status</span>
                <select className="input" value={voterFilters.status} onChange={(event) => setVoterFilters({ ...voterFilters, status: event.target.value })}>
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
              <label>
                <span className="label">Department</span>
                <select className="input" value={voterFilters.department} onChange={(event) => setVoterFilters({ ...voterFilters, department: event.target.value })}>
                  <option value="all">All departments</option>
                  {voterDepartments.map((department) => <option key={department} value={department}>{department}</option>)}
                </select>
              </label>
            </div>
          <div className="w-full max-w-full overflow-hidden">
            <div className="space-y-3 md:hidden">
              {!dataLoading && recentVoters.map((voter) => (
                <div key={`mobile-voter-${voter.id}`} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                  <div className="grid grid-cols-2 gap-3">
                    <MobileDetail label="Name" value={voter.full_name} />
                    <MobileDetail label="Matric" value={voter.matric} />
                    <MobileDetail label="Department" value={voter.department} />
                    <MobileDetail label="Level" value={voter.level} />
                    <MobileDetail label="Email" value={voter.email} />
                    <MobileDetail label="Status" value={voter.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!perms.canManageVoters || busy} onClick={() => run(() => updateVoterStatusWithReason(voter.id, 'approved'), 'Voter approved.')}><Check size={15} />Approve</button>
                    <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!perms.canManageVoters || busy} onClick={() => run(() => updateVoterStatusWithReason(voter.id, 'rejected'), 'Voter rejected.')}><X size={15} />Reject</button>
                    <button className="btn-danger col-span-2 min-h-9 px-3 py-1.5" disabled={!canDeleteVoters} onClick={() => requestDelete('voter', voter)}><Trash2 size={15} />Remove</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block">
            <div
              className="admin-table-scroll w-full overflow-x-auto overflow-y-hidden rounded-xl border border-slate-700"
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x', maxWidth: '100vw' }}
            >
                <table className="table admin-wide-table min-w-[1200px] table-fixed">
                <colgroup><col className="w-[220px]" /><col className="w-[130px]" /><col className="w-[200px]" /><col className="w-[90px]" /><col className="w-[240px]" /><col className="w-[140px]" /><col className="w-[340px]" /></colgroup>
                <thead><tr><th>Name</th><th>Matric</th><th>Department</th><th>Level</th><th>Email</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {filteredVoters.length === 0 && <tr><td colSpan={7}><div className="py-8 text-center text-sm text-slate-500">No voters match these filters.</div></td></tr>}
                  {pagedVoters.map((voter) => (
                    <tr key={voter.id}>
                      <td className="px-4 py-4 align-middle whitespace-nowrap"><div className="max-w-[210px] truncate font-semibold">{voter.full_name}</div></td>
                      <td className="px-4 py-4 align-middle whitespace-nowrap font-mono text-xs">{voter.matric}</td>
                      <td className="px-4 py-4 align-middle whitespace-nowrap"><div className="max-w-[220px] truncate">{voter.department || 'N/A'}</div></td>
                      <td className="px-4 py-4 align-middle whitespace-nowrap">{voter.level || 'N/A'}</td>
                      <td className="px-4 py-4 align-middle whitespace-nowrap"><div className="max-w-[220px] truncate">{voter.email || 'N/A'}</div></td>
                      <td className="px-4 py-4 align-middle whitespace-nowrap"><span className={`badge inline-flex shrink-0 whitespace-nowrap capitalize ${statusBadgeClass(voter.status)}`}>{voter.status}</span></td>
                      <td className="px-4 py-4 align-middle whitespace-nowrap">
                        <div className="flex items-center gap-3 whitespace-nowrap">
                          <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!perms.canManageVoters || busy} onClick={() => run(() => updateVoterStatusWithReason(voter.id, 'approved'), 'Voter approved.')}><Check size={15} />Approve</button>
                          <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!perms.canManageVoters || busy} onClick={() => run(() => updateVoterStatusWithReason(voter.id, 'rejected'), 'Voter rejected.')}><X size={15} />Reject</button>
                          <button className="btn-danger min-h-9 shrink-0 px-3 py-1.5" disabled={!canDeleteVoters} onClick={() => requestDelete('voter', voter)}><Trash2 size={15} />Remove</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
              <p className="mt-2 hidden text-xs font-semibold text-slate-500 dark:text-slate-400 md:block">
                Swipe left/right to view all columns and actions.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-slate-500 dark:text-slate-400">Page {voterPage} of {voterPageCount}</span>
              <div className="flex gap-2">
                <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={voterPage <= 1} onClick={() => setVoterPage((page) => Math.max(1, page - 1))}>Previous</button>
                <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={voterPage >= voterPageCount} onClick={() => setVoterPage((page) => Math.min(voterPageCount, page + 1))}>Next</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {fullView === 'candidates' && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="card flex max-h-[92vh] w-full max-w-7xl flex-col p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">All candidates</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">{filteredCandidateRows.length} of {candidateRows.length} records shown</p>
              </div>
              <button className="btn-secondary px-3 py-2" onClick={() => setFullView(null)}>Close</button>
            </div>
            <div className="mb-4 grid gap-3 md:grid-cols-[1fr_170px_220px_220px]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-9 text-slate-400" size={17} />
                <span className="label">Search</span>
                <input className="input pl-10" placeholder="Name, matric, email, position" value={candidateFilters.search} onChange={(event) => setCandidateFilters({ ...candidateFilters, search: event.target.value })} />
              </label>
              <label>
                <span className="label">Status</span>
                <select className="input" value={candidateFilters.status} onChange={(event) => setCandidateFilters({ ...candidateFilters, status: event.target.value })}>
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
              <label>
                <span className="label">Position</span>
                <select className="input" value={candidateFilters.position} onChange={(event) => setCandidateFilters({ ...candidateFilters, position: event.target.value })}>
                  <option value="all">All positions</option>
                  {candidatePositions.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}
                </select>
              </label>
              <label>
                <span className="label">Department</span>
                <select className="input" value={candidateFilters.department} onChange={(event) => setCandidateFilters({ ...candidateFilters, department: event.target.value })}>
                  <option value="all">All departments</option>
                  {candidateDepartments.map((department) => <option key={department} value={department}>{department}</option>)}
                </select>
              </label>
            </div>
          <div className="w-full max-w-full overflow-hidden">
            <div className="space-y-3 md:hidden">
              {!dataLoading && recentCandidateRows.map((row) => (
                <div key={`mobile-candidate-${row.row_id}`} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                  <div className="grid grid-cols-2 gap-3">
                    <MobileDetail label="Name" value={row.full_name} />
                    <MobileDetail label="Matric" value={row.matric} />
                    <MobileDetail label="Position" value={positionLabel(row.position_id)} />
                    <MobileDetail label="Department" value={row.department} />
                    <MobileDetail label="Level" value={row.level} />
                    <MobileDetail label="CGPA" value={row.cgpa} />
                    <MobileDetail label="Status" value={row.status} />
                    <MobileDetail label="Source" value={row.source} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={busy} onClick={() => setReviewRowId(row.row_id)}><Eye size={15} />View</button>
                    <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!canApproveCandidateActions} onClick={() => run(() => updateCandidateRowStatus(row, 'approved'), 'Candidate approved.')}><Check size={15} />Approve</button>
                    <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!canApproveCandidateActions} onClick={() => run(() => updateCandidateRowStatus(row, 'rejected'), 'Candidate rejected.')}><X size={15} />Reject</button>
                    <button className="btn-danger min-h-9 shrink-0 px-3 py-1.5" disabled={!canDeleteCandidates} onClick={() => requestDelete('candidate', row)}><Trash2 size={15} />Remove</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block">
            <div
              className="admin-table-scroll w-full overflow-x-auto overflow-y-hidden rounded-xl border border-slate-700"
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x', maxWidth: '100vw' }}
            >
                <table className="table admin-wide-table min-w-[1200px] table-fixed">
                <colgroup><col className="w-[220px]" /><col className="w-[220px]" /><col className="w-[200px]" /><col className="w-[90px]" /><col className="w-[90px]" /><col className="w-[140px]" /><col className="w-[180px]" /><col className="w-[110px]" /><col className="w-[360px]" /></colgroup>
                <thead><tr><th>Name</th><th>Position</th><th>Department</th><th>Level</th><th>CGPA</th><th>Status</th><th>Submitted</th><th>Source</th><th>Actions</th></tr></thead>
                <tbody>
                  {filteredCandidateRows.length === 0 && <tr><td colSpan={9}><div className="py-8 text-center text-sm text-slate-500">No candidates match these filters.</div></td></tr>}
                  {pagedCandidateRows.map((row) => (
                    <tr key={row.row_id}>
                      <td className="px-4 py-4 align-middle whitespace-nowrap"><div className="max-w-[210px] truncate font-semibold">{row.full_name}</div><div className="font-mono text-xs text-slate-500">{row.matric || 'N/A'}</div></td>
                      <td className="px-4 py-4 align-middle whitespace-nowrap"><div className="max-w-[200px] truncate">{positionLabel(row.position_id)}</div></td>
                      <td className="px-4 py-4 align-middle whitespace-nowrap"><div className="max-w-[170px] truncate">{row.department || 'N/A'}</div></td>
                      <td className="px-4 py-4 align-middle whitespace-nowrap">{row.level || 'N/A'}</td>
                      <td className="px-4 py-4 align-middle whitespace-nowrap">{row.cgpa || 'N/A'}</td>
                      <td className="px-4 py-4 align-middle whitespace-nowrap"><span className={`badge inline-flex shrink-0 whitespace-nowrap capitalize ${statusBadgeClass(row.status)}`}>{row.status || 'pending'}</span></td>
                      <td className="px-4 py-4 align-middle whitespace-nowrap">{compactDate(row.submitted_at)}</td>
                      <td className="px-4 py-4 align-middle whitespace-nowrap"><span className="badge inline-flex shrink-0 whitespace-nowrap bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{row.source}</span></td>
                      <td className="px-4 py-4 align-middle whitespace-nowrap">
                        <div className="flex items-center gap-3 whitespace-nowrap">
                          <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={busy} onClick={() => setReviewRowId(row.row_id)}><Eye size={15} />View</button>
                          <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!canApproveCandidateActions} onClick={() => run(() => updateCandidateRowStatus(row, 'approved'), 'Candidate approved.')}><Check size={15} />Approve</button>
                          <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={!canApproveCandidateActions} onClick={() => run(() => updateCandidateRowStatus(row, 'rejected'), 'Candidate rejected.')}><X size={15} />Reject</button>
                          <button className="btn-danger min-h-9 shrink-0 px-3 py-1.5" disabled={!canDeleteCandidates} onClick={() => requestDelete('candidate', row)}><Trash2 size={15} />Remove</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
              <p className="mt-2 hidden text-xs font-semibold text-slate-500 dark:text-slate-400 md:block">
                Swipe left/right to view all columns and actions.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-slate-500 dark:text-slate-400">Page {candidatePage} of {candidatePageCount}</span>
              <div className="flex gap-2">
                <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={candidatePage <= 1} onClick={() => setCandidatePage((page) => Math.max(1, page - 1))}>Previous</button>
                <button className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" disabled={candidatePage >= candidatePageCount} onClick={() => setCandidatePage((page) => Math.min(candidatePageCount, page + 1))}>Next</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {reviewCandidate && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm">
        <div className="card max-h-[90vh] w-full max-w-5xl overflow-y-auto p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold"><FileText size={18} />Candidate review</h2>
              <p className="text-sm text-slate-500">Submitted {reviewCandidate.submitted_at ? new Date(reviewCandidate.submitted_at).toLocaleString() : 'N/A'}</p>
            </div>
            <button className="btn-secondary px-3 py-2" onClick={() => setReviewRowId(null)}>Close</button>
          </div>
          <div className="grid gap-5 lg:grid-cols-[180px_1fr]">
            <CandidateReviewPhoto
              candidate={{ ...reviewCandidate, photo_url: candidatePhotoCache[reviewPhotoUrl]?.resolvedUrl || reviewPhotoUrl }}
              photoCache={candidatePhotoCache}
              onPhotoState={markCandidatePhotoState}
            />
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ['Full name', reviewCandidate.full_name],
                  ['Position', positionLabel(reviewCandidate.position_id)],
                  ['Department', reviewCandidate.department],
                  ['Level', reviewCandidate.level],
                  ['CGPA', reviewCandidate.cgpa],
                  ['Status', reviewCandidate.status],
                  ['Source', reviewCandidate.source],
                  ['Matric', reviewCandidate.matric],
                  ['Submitted at', reviewCandidate.submitted_at ? new Date(reviewCandidate.submitted_at).toLocaleString() : 'N/A']
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
                    <p className="mt-1 break-words text-sm font-semibold">{value || 'N/A'}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="label">Manifesto</p>
                <p className="rounded-lg bg-slate-50 p-3 text-sm leading-6 dark:bg-slate-800">{reviewCandidate.manifesto || 'N/A'}</p>
              </div>
              <div>
                <p className="label">Promises</p>
                <ul className="rounded-lg bg-slate-50 p-3 text-sm leading-6 dark:bg-slate-800">
                  {(Array.isArray(reviewCandidate.promises) ? reviewCandidate.promises : []).length
                    ? reviewCandidate.promises.map((promise, index) => <li key={index}>- {promise}</li>)
                    : <li>N/A</li>}
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" disabled={!canApproveCandidateActions} onClick={() => run(() => updateCandidateRowStatus(reviewCandidate, 'approved'), 'Candidate approved.')}><Check size={17} />Approve</button>
                <button className="btn-danger" disabled={!canApproveCandidateActions} onClick={() => run(() => updateCandidateRowStatus(reviewCandidate, 'rejected'), 'Candidate rejected.')}><X size={17} />Reject</button>
              </div>
            </div>
          </div>
        </div>
        </div>
      )}
      {selectedBlock && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="card max-h-[90vh] w-full max-w-3xl overflow-y-auto p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold"><Blocks size={18} />Block #{selectedBlock.block_number}</h2>
                <p className="text-sm text-slate-500">PBFT confirmations: {selectedBlock.confirmation_count || 0}/5</p>
              </div>
              <button className="btn-secondary px-3 py-2" onClick={() => setSelectedBlock(null)}>Close</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Receipt hash', selectedBlock.receipt_hash],
                ['Block hash', selectedBlock.block_hash],
                ['Previous hash', selectedBlock.previous_hash || 'genesis'],
                ['Transaction hash', selectedBlock.tx_hash],
                ['Validation status', selectedBlock.validation_status],
                ['Anonymous ID', selectedBlock.anonymous_verification_id],
                ['Timestamp', compactDate(selectedBlock.created_at)]
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-1 break-all font-mono text-sm font-semibold">{value || 'N/A'}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Validator votes</p>
              <pre className="mt-2 overflow-auto rounded bg-white p-3 text-xs dark:bg-slate-950">{JSON.stringify(selectedBlock.validator_votes || {}, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
      {resetApprovalModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)] dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Approve password reset</p>
                <h2 className="text-xl font-black tracking-tight">Set temporary password</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Generate or enter a temporary password before approving this request.</p>
              </div>
              <button className="btn-secondary h-9 w-9 p-0" onClick={() => setResetApprovalModal(null)} aria-label="Close"><X size={17} /></button>
            </div>
            <div className="space-y-4">
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Voter email</p>
                <p className="mt-1 break-all font-semibold">{resetApprovalModal.request.voters?.email || 'N/A'}</p>
              </div>
              <label>
                <span className="label">Temporary password</span>
                <div className="relative">
                  <input
                    className="input min-h-12 pr-12 font-mono text-base dark:border-slate-700 dark:bg-slate-900/85 dark:text-white"
                    type={resetPasswordVisible ? 'text' : 'password'}
                    value={resetApprovalModal.temporaryPassword}
                    onChange={(event) => updateResetTemporaryPassword(event.target.value)}
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setResetPasswordVisible((value) => !value)}
                    aria-label={resetPasswordVisible ? 'Hide temporary password' : 'Show temporary password'}
                  >
                    {resetPasswordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
              <StatusMessage>{resetPasswordError}</StatusMessage>
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" className="btn-secondary" onClick={() => updateResetTemporaryPassword(generateTemporaryPassword())}><KeyRound size={17} />Generate Secure Password</button>
                <button type="button" className="btn-secondary" disabled={!resetApprovalModal.temporaryPassword} onClick={() => copyTemporaryPassword(resetApprovalModal.temporaryPassword)}><Copy size={17} />Copy password</button>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" className="btn-secondary" onClick={() => setResetApprovalModal(null)} disabled={busy}>Cancel</button>
                <button type="button" className="btn-primary" onClick={approvePasswordResetRequest} disabled={busy}>{busy ? <Loader2 className="animate-spin" size={17} /> : <Check size={17} />}Approve Reset</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {temporaryPasswordModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)] dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Password reset approved</p>
                <h2 className="text-xl font-black tracking-tight">Temporary password approved successfully</h2>
              </div>
              <button className="btn-secondary h-9 w-9 p-0" onClick={() => setTemporaryPasswordModal(null)} aria-label="Close"><X size={17} /></button>
            </div>
            <div className="space-y-3">
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Voter email</p>
                <p className="mt-1 break-all font-semibold">{temporaryPasswordModal.email}</p>
              </div>
              <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 dark:border-brand-900 dark:bg-brand-950">
                <p className="text-xs font-bold uppercase tracking-wide text-brand-700 dark:text-brand-100">Temporary password</p>
                <p className="mt-1 break-all font-mono text-lg font-black text-brand-800 dark:text-brand-100">{temporaryPasswordModal.temporaryPassword}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button className="btn-secondary w-full" onClick={() => copyTemporaryPassword(temporaryPasswordModal.temporaryPassword)}><Copy size={17} />Copy password</button>
                <button className="btn-primary w-full" onClick={() => setTemporaryPasswordModal(null)}>Done</button>
              </div>
              <StatusMessage type="success">Temporary password approved successfully. Share securely with voter.</StatusMessage>
            </div>
          </div>
        </div>
      )}
      {newElectionOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 px-4 backdrop-blur-sm">
          <form onSubmit={submitNewElection} className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Election cycle</p>
                <h2 className="text-xl font-black tracking-tight">Create new election</h2>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Old finalized election records will remain immutable and verifiable.</p>
              </div>
              <button type="button" className="btn-secondary h-9 w-9 p-0" onClick={() => setNewElectionOpen(false)} disabled={busy} aria-label="Close">
                <X size={17} />
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="md:col-span-2"><span className="label">Election title</span><input className="input" required value={newElectionForm.title} onChange={(event) => setNewElectionForm({ ...newElectionForm, title: event.target.value })} placeholder="WUCC Election 2026" /></label>
              <label><span className="label">Academic/session year</span><input className="input" value={newElectionForm.academicYear} onChange={(event) => setNewElectionForm({ ...newElectionForm, academicYear: event.target.value })} placeholder="2025/2026" /></label>
              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">Current ledger: <span className="font-bold">{phase === 'finalized' ? 'Finalized and locked' : 'Ended and ready to archive'}</span></div>
              <label><span className="label">Start date/time</span><input type="datetime-local" className="input" value={newElectionForm.startsAt} onChange={(event) => setNewElectionForm({ ...newElectionForm, startsAt: event.target.value })} /></label>
              <label><span className="label">End date/time</span><input type="datetime-local" className="input" value={newElectionForm.endsAt} onChange={(event) => setNewElectionForm({ ...newElectionForm, endsAt: event.target.value })} /></label>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <input type="checkbox" className="mt-1" checked={newElectionForm.keepApprovedVoters} onChange={(event) => setNewElectionForm({ ...newElectionForm, keepApprovedVoters: event.target.checked })} />
                <span><span className="block font-bold">Keep approved voters</span><span className="text-sm text-slate-500 dark:text-slate-400">Approved voters remain active and can vote again in the new election.</span></span>
              </label>
              <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <input type="checkbox" className="mt-1" checked={newElectionForm.reopenCandidateApplications} onChange={(event) => setNewElectionForm({ ...newElectionForm, reopenCandidateApplications: event.target.checked })} />
                <span><span className="block font-bold">Reopen candidate applications</span><span className="text-sm text-slate-500 dark:text-slate-400">Fresh applications will attach to the new election cycle.</span></span>
              </label>
            </div>
            <div className="mt-4 rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm font-semibold text-brand-700 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-100">
              Old finalized election records, votes, receipts, blocks, and results will remain immutable and verifiable.
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" onClick={() => setNewElectionOpen(false)} disabled={busy}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={!canCreateElection}>{busy ? <Loader2 className="animate-spin" size={17} /> : <PlusCircle size={17} />}Create cycle</button>
            </div>
          </form>
        </div>
      )}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={deleteTarget?.type === 'voter' ? 'Remove voter' : 'Remove candidate'}
        message={
          deleteTarget?.type === 'voter'
            ? `Are you sure you want to remove ${deleteTarget?.item?.full_name || 'this voter'}? This is only allowed before the election starts.`
            : `Are you sure you want to remove ${deleteTarget?.item?.full_name || 'this candidate'}? This is only allowed before the election starts.`
        }
        confirmLabel="Remove"
        loading={busy}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
      <Toast type={error ? 'error' : 'success'} onClose={() => { setError(''); setSuccess(''); }}>
        {error || success}
      </Toast>
      <ConfirmModal
        open={resetConfirm}
        title="Reset election ledger"
        message="Reset only the current non-finalized election votes, receipts, blocks, voter has-voted flags, and election status? Finalized ledgers cannot be reset."
        confirmLabel="Reset election"
        loading={busy}
        onConfirm={() => run(async () => {
          await resetElectionData();
          setResetConfirm(false);
        }, 'Election data reset.')}
        onClose={() => setResetConfirm(false)}
      />
    </section>
  );
}
