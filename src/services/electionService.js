import { supabase, supabaseConfigError } from '../config/supabase';
import { normalizeRole } from './roles';
import { getWuccPositionTitle, sortWuccPositions } from '../constants/wuccPositions';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VOTER_SESSION_KEY = 'wucc_voter_session';
const AUTH_PERSIST_KEY = 'wucc_auth_persisted';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const missingRpcCodes = new Set(['42883', 'PGRST202']);
const SAFE_VOTER_COLUMNS = 'id, auth_user_id, full_name, matric, department, level, email, status, has_voted, must_change_password, password_changed_at, reset_approved_at, reset_approved_by, rejection_reason, created_at, updated_at';
const LEGACY_SAFE_VOTER_COLUMNS = 'id, auth_user_id, full_name, matric, department, level, email, status, has_voted, password_changed_at, rejection_reason, created_at, updated_at';
const CANDIDATE_PHOTO_BUCKET = 'candidate-photos';
const CANDIDATE_PHOTO_MAX_BYTES = 500 * 1024;
const CANDIDATE_PHOTO_MAX_WIDTH = 600;
let applicationPositionsCache = null;

function devAuthLog(message, details = {}) {
  if (import.meta.env.DEV) {
    console.log(message, details);
  }
}

function requireClient() {
  if (!supabase) throw new Error(supabaseConfigError || 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  return supabase;
}

export function markAuthPersisted() {
  localStorage.setItem(AUTH_PERSIST_KEY, 'true');
}

export function hasPersistedAuthMarker() {
  return localStorage.getItem(AUTH_PERSIST_KEY) === 'true';
}

export function clearAuthStorage() {
  localStorage.removeItem(VOTER_SESSION_KEY);
  localStorage.removeItem(AUTH_PERSIST_KEY);
  sessionStorage.removeItem('wucc_tab_session_active');
  [localStorage, sessionStorage].forEach((storage) => {
    Object.keys(storage).forEach((key) => {
      if (/^sb-.*-auth-token$/.test(key) || key.includes('supabase.auth.token')) {
        storage.removeItem(key);
      }
    });
  });
}

function normalizePublicReceipt(row) {
  return {
    election_id: row.election_id || null,
    election_title: row.election_title || null,
    block_number: row.block_number,
    receipt_hash: row.receipt_hash || row.tx_hash || null,
    block_hash: row.block_hash || row.tx_hash || null,
    consensus_status: row.consensus_status || row.validation_status || row.validator_status || 'confirmed',
    created_at: row.created_at || row.timestamp || null
  };
}

async function fetchPublicReceipts(sb, electionId) {
  const attempts = [
    async () => {
      let query = sb
        .from('blockchain_ledger')
        .select('election_id, election_title, block_number, receipt_hash, block_hash, consensus_status, validation_status, validator_status, created_at')
        .order('block_number', { ascending: false })
        .limit(100);
      if (electionId) query = query.eq('election_id', electionId);
      return query;
    },
    async () => {
      let query = sb
        .from('blockchain_ledger')
        .select('election_id, election_title, block_number, receipt_hash, block_hash, validation_status, validator_status, created_at')
        .order('block_number', { ascending: false })
        .limit(100);
      if (electionId) query = query.eq('election_id', electionId);
      return query;
    },
    async () => {
      let query = sb
        .from('vote_receipts')
        .select('election_id, election_title, block_number, receipt_hash, block_hash, consensus_status, validation_status, created_at')
        .order('block_number', { ascending: false })
        .limit(100);
      if (electionId) query = query.eq('election_id', electionId);
      return query;
    },
    async () => {
      let query = sb
        .from('vote_receipts')
        .select('election_id, election_title, block_number, receipt_hash, block_hash, validation_status, created_at')
        .order('block_number', { ascending: false })
        .limit(100);
      if (electionId) query = query.eq('election_id', electionId);
      return query;
    },
    async () => (electionId ? sb.rpc('get_election_receipts_safe', { p_election_id: electionId }) : sb.rpc('get_public_receipts_safe'))
  ];

  if (!electionId) {
    attempts.splice(4, 0, async () => sb
      .from('vote_receipts')
      .select('block_number, receipt_hash, block_hash, validation_status, created_at')
      .order('block_number', { ascending: false })
      .limit(100));
  }

  for (const attempt of attempts) {
    const res = await attempt();
    if (!res.error) return (res.data || []).map(normalizePublicReceipt);
    console.error('Public receipts fetch failed', res.error);
  }

  return [];
}

async function selectSafeVoters(queryBuilder) {
  const res = await queryBuilder(SAFE_VOTER_COLUMNS);
  if (res.error && /must_change_password|reset_approved/i.test(res.error.message || '')) {
    return queryBuilder(LEGACY_SAFE_VOTER_COLUMNS);
  }
  return res;
}

export async function loadElectionData() {
  const sb = requireClient();
  const sessionRes = await sb.auth.getSession();
  const hasSupabaseSession = Boolean(sessionRes.data?.session?.user);
  const electionsRes = await sb.from('elections').select('*').order('created_at', { ascending: false });
  if (electionsRes.error) throw electionsRes.error;

  const elections = electionsRes.data || [];
  const currentElection = elections[0] || null;
  const electionId = currentElection?.id;
  const positionsQuery = sb.from('positions').select('*, candidates(*)').eq('is_active', true).order('display_order', { ascending: true });
  if (electionId) positionsQuery.eq('election_id', electionId);
  const applicationsQuery = sb.from('candidate_applications').select('*').order('created_at', { ascending: false });
  const candidatesQuery = sb.from('candidates').select('*').order('created_at', { ascending: false });
  if (electionId) {
    applicationsQuery.eq('election_id', electionId);
    candidatesQuery.eq('election_id', electionId);
  }

  const [positionsRes, resultsRes, ballotsRes, votersRes, statsRes, appsRes, candidatesRes, ledgerRes, auditRes, passwordResetRes] = await Promise.all([
    positionsQuery,
    sb.rpc('get_candidate_results_safe'),
    fetchPublicReceipts(sb, electionId),
    hasSupabaseSession ? selectSafeVoters((columns) => sb.from('voters').select(columns).order('full_name', { ascending: true })) : Promise.resolve({ data: [], error: null }),
    sb.rpc('get_election_stats_safe'),
    hasSupabaseSession && electionId ? applicationsQuery : Promise.resolve({ data: [], error: null }),
    hasSupabaseSession && electionId ? candidatesQuery : Promise.resolve({ data: [], error: null }),
    hasSupabaseSession && electionId ? sb.from('blockchain_ledger').select('*').eq('election_id', electionId).order('block_number', { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
    hasSupabaseSession && electionId ? sb.from('audit_logs').select('*').or(`record_id.eq.${electionId},details->>election_id.eq.${electionId}`).order('created_at', { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
    hasSupabaseSession ? sb.from('voter_password_reset_requests').select('*, voters(full_name, matric, email, department)').order('created_at', { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null })
  ]);

  if (positionsRes.error) throw positionsRes.error;
  if (hasSupabaseSession && votersRes.error) throw new Error(cleanSupabaseMessage(votersRes.error));
  if (hasSupabaseSession && appsRes.error) throw new Error(cleanSupabaseMessage(appsRes.error));
  if (hasSupabaseSession && candidatesRes.error) throw new Error(cleanSupabaseMessage(candidatesRes.error));
  if (hasSupabaseSession && ledgerRes.error) console.warn('[supabase] ledger fetch failed', ledgerRes.error);
  if (hasSupabaseSession && auditRes.error) console.warn('[supabase] audit log fetch failed', auditRes.error);
  if (hasSupabaseSession && passwordResetRes.error) console.warn('[supabase] password reset request fetch failed', passwordResetRes.error);
  if (resultsRes.error) {
    console.warn('[supabase] result RPC failed; showing zeroed candidate results', resultsRes.error);
  }

  const resultRows = (resultsRes.error ? [] : resultsRes.data || []).filter((row) => row.election_id === electionId);
  const resultMap = new Map(resultRows.map((row) => [row.candidate_id, Number(row.vote_count || 0)]));
  const statsRows = Array.isArray(statsRes.data) ? statsRes.data : statsRes.data ? [statsRes.data] : [];
  const currentStats = statsRows.find((row) => row.election_id === electionId) || null;
  const positions = sortWuccPositions((positionsRes.data || []).map((position) => {
    const candidates = (position.candidates || [])
      .filter((candidate) => candidate.status === 'approved' && (!electionId || candidate.election_id === electionId))
      .map((candidate) => ({
        ...candidate,
        votes: resultMap.get(candidate.id) || 0
      }));
    return { ...position, title: getWuccPositionTitle(position), original_title: position.title, candidates };
  }));

  return {
    election: currentElection || { title: 'Votechain Election', status: 'inactive' },
    elections,
    positions,
    ballots: ballotsRes,
    voters: votersRes.error ? [] : votersRes.data || [],
    stats: statsRes.error ? null : currentStats,
    applications: appsRes.error ? [] : (appsRes.data || []).filter((row) => !electionId || row.election_id === electionId),
    candidates: candidatesRes.error ? [] : (candidatesRes.data || []).filter((row) => !electionId || row.election_id === electionId),
    ledger: ledgerRes.error ? [] : ledgerRes.data || [],
    auditLogs: auditRes.error ? [] : auditRes.data || [],
    passwordResetRequests: passwordResetRes.error ? [] : passwordResetRes.data || []
  };
}

export async function loadElectionResults(electionId) {
  const sb = requireClient();
  if (!electionId) return null;

  const [electionRes, positionsRes, resultsRes, receipts, statsRes] = await Promise.all([
    sb.from('elections').select('*').eq('id', electionId).maybeSingle(),
    sb.from('positions').select('*, candidates(*)').eq('election_id', electionId).eq('is_active', true).order('display_order', { ascending: true }),
    sb.rpc('get_candidate_results_safe'),
    fetchPublicReceipts(sb, electionId),
    sb.rpc('get_election_stats_safe')
  ]);

  if (electionRes.error) throw electionRes.error;
  if (positionsRes.error) throw positionsRes.error;
  if (resultsRes.error) console.warn('[supabase] result RPC failed for selected election', resultsRes.error);
  if (statsRes.error) console.warn('[supabase] stats RPC failed for selected election', statsRes.error);

  const resultRows = (resultsRes.error ? [] : resultsRes.data || []).filter((row) => row.election_id === electionId);
  const resultMap = new Map(resultRows.map((row) => [row.candidate_id, Number(row.vote_count || 0)]));
  const positions = sortWuccPositions((positionsRes.data || []).map((position) => {
    const candidates = (position.candidates || [])
      .filter((candidate) => candidate.status === 'approved' && candidate.election_id === electionId)
      .map((candidate) => ({
        ...candidate,
        votes: resultMap.get(candidate.id) || 0
      }));
    return { ...position, title: getWuccPositionTitle(position), original_title: position.title, candidates };
  }));
  const statsRows = statsRes.error ? [] : statsRes.data || [];
  const stats = statsRows.find((row) => row.election_id === electionId) || null;

  return {
    election: electionRes.data,
    positions,
    ballots: receipts,
    stats
  };
}

export async function loadElectionLedger(electionId) {
  const sb = requireClient();
  if (!electionId) return [];
  const res = await sb
    .from('blockchain_ledger')
    .select('id, election_id, election_title, election_status, ledger_status, block_number, tx_hash, receipt_hash, block_hash, previous_hash, validator_status, validation_status, consensus_status, confirmation_count, anonymous_verification_id, created_at')
    .eq('election_id', electionId)
    .order('block_number', { ascending: false });
  if (res.error) {
    console.error('[supabase] election ledger history fetch failed', res.error);
    throw new Error(cleanSupabaseMessage(res.error));
  }
  return res.data || [];
}

export async function loadElectionAuditTrail(electionId) {
  const sb = requireClient();
  if (!electionId) return [];
  const res = await sb
    .from('audit_logs')
    .select('*')
    .or(`record_id.eq.${electionId},details->>election_id.eq.${electionId}`)
    .order('created_at', { ascending: false })
    .limit(100);
  if (res.error) {
    console.error('[supabase] election audit trail fetch failed', res.error);
    throw new Error(cleanSupabaseMessage(res.error));
  }
  return res.data || [];
}

export async function loadElectionHistory() {
  const sb = requireClient();
  const [electionsRes, statsRes] = await Promise.all([
    sb.from('elections').select('*').order('created_at', { ascending: false }),
    sb.rpc('get_election_stats_safe')
  ]);
  if (electionsRes.error) throw new Error(cleanSupabaseMessage(electionsRes.error));
  if (statsRes.error) console.warn('[supabase] election history stats fetch failed', statsRes.error);

  const statsRows = statsRes.error ? [] : Array.isArray(statsRes.data) ? statsRes.data : statsRes.data ? [statsRes.data] : [];
  const statsByElection = new Map(statsRows.map((row) => [row.election_id, row]));
  return (electionsRes.data || []).map((election) => {
    const stats = statsByElection.get(election.id) || {};
    return {
      ...election,
      total_voters: Number(stats.registered_voters || 0),
      total_votes_cast: Number(stats.ballots_cast || stats.voted_voters || 0)
    };
  });
}

export async function logElectionViewed(electionId, viewType) {
  if (!electionId) return;
  const sb = requireClient();
  const res = await sb.rpc('write_audit_log', {
    p_action: 'election_viewed',
    p_record_table: 'elections',
    p_record_id: electionId,
    p_details: { view_type: viewType || 'history' }
  });
  if (res.error) console.warn('[supabase] election_viewed audit log failed', res.error);
}

function storeVoterSession(session) {
  localStorage.setItem(VOTER_SESSION_KEY, JSON.stringify(session));
  markAuthPersisted();
}

function updateStoredVoter(nextVoter) {
  const current = getStoredVoterSession();
  if (!current) return;
  storeVoterSession({ ...current, voter: nextVoter });
}

function normalizeVoterRecord(row, fallback = {}) {
  if (!row) return null;
  return {
    ...fallback,
    ...row,
    matric: normalizeMatric(row.matric || fallback.matric),
    email: String(row.email || fallback.email || '').trim().toLowerCase(),
    status: String(row.status || fallback.status || '').toLowerCase(),
    has_voted: Boolean(row.has_voted),
    password_is_default: row.password_is_default ?? row.must_change_password ?? fallback.password_is_default ?? fallback.must_change_password,
    must_change_password: row.must_change_password ?? row.password_is_default ?? fallback.must_change_password ?? fallback.password_is_default
  };
}

function normalizeReceiptRecord(row, fallback = {}) {
  if (!row) return null;
  const block = Array.isArray(row.blocks) ? row.blocks[0] : row.blocks;
  const receipt = {
    ...fallback,
    ...row,
    receipt_hash: row.receipt_hash || fallback.receipt_hash || block?.receipt_hash || null,
    block_hash: row.block_hash || fallback.block_hash || block?.block_hash || null,
    block_number: row.block_number ?? fallback.block_number ?? block?.block_number ?? null,
    anonymous_verification_id: row.anonymous_verification_id || row.anonymous_id || fallback.anonymous_verification_id || block?.anonymous_verification_id || null,
    confirmation_count: row.confirmation_count ?? fallback.confirmation_count ?? block?.confirmation_count ?? null,
    validator_votes: row.validator_votes || fallback.validator_votes || block?.validator_votes || null,
    validation_status: row.validation_status || fallback.validation_status || block?.validation_status || 'pbft_confirmed',
    created_at: row.created_at || fallback.created_at || block?.created_at || null,
    election_title: row.election_title || fallback.election_title || null,
    has_ballot: Boolean(row.has_ballot ?? row.receipt_hash ?? block?.receipt_hash)
  };
  return receipt.receipt_hash || receipt.block_hash || receipt.block_number ? receipt : null;
}

export async function signInVoter(emailAddress, password) {
  const sb = requireClient();
  try {
    const email = emailAddress.trim().toLowerCase();
    if (!email || !password) throw new Error('Enter your email address and password.');
    if (!EMAIL_RE.test(email)) throw new Error('Enter a valid voter email address.');

    devAuthLog('[auth] voter email searched', { email });

    const lookupRes = await sb.rpc('get_voter_login_by_email', { p_email: email }).maybeSingle();
    if (lookupRes.error && isMissingRpc(lookupRes.error)) {
      console.error('[auth] get_voter_login_by_email RPC missing; voter login lookup is unavailable', lookupRes.error);
      throw new Error('Voter login is temporarily unavailable.');
    }
    if (lookupRes.error) throw new Error(cleanSupabaseMessage(lookupRes.error));

    const lookupVoter = normalizeVoterRecord(lookupRes.data);
    const lookupStatus = String(lookupVoter?.status || '').toLowerCase();
    const approvedVoterFound = Boolean(lookupVoter && lookupStatus === 'approved');
    devAuthLog('[auth] voter lookup result', {
      email,
      found: Boolean(lookupVoter),
      approved: approvedVoterFound,
      voterId: lookupVoter?.id || null
    });

    if (!approvedVoterFound) {
      throw new Error('No approved voter found for this email.');
    }

    const voterRes = await sb.rpc('verify_voter_password', { p_email: email, p_password: password }).maybeSingle();
    if (voterRes.error && isMissingRpc(voterRes.error)) {
      console.error('[auth] verify_voter_password RPC missing; voter password login is unavailable', voterRes.error);
      throw new Error('Voter password login is temporarily unavailable.');
    }
    if (voterRes.error) throw new Error(cleanSupabaseMessage(voterRes.error));
    devAuthLog('[auth] voter password verification result', {
      email,
      verified: Boolean(voterRes.data),
      voterId: voterRes.data?.id || lookupVoter.id
    });
    if (!voterRes.data) throw new Error('Password is incorrect.');
    const voterStatus = String(voterRes.data.status || lookupVoter.status || '').toLowerCase();
    if (voterStatus !== 'approved') throw new Error('No approved voter found for this email.');
    if (!voterRes.data.email) throw new Error('This voter record has no email address.');

    const voter = normalizeVoterRecord({ ...voterRes.data, email, status: voterStatus }, lookupVoter);
    const profile = { full_name: voter.full_name, role: 'voter' };
    const user = { id: voter.id, email: voter.email, user_metadata: { role: 'voter' } };
    storeVoterSession({ user, profile, voter });
    devAuthLog('[auth] voter database login succeeded', { voterId: voterRes.data.id, email, mustChangePassword: Boolean(voter.must_change_password) });
    return { user, profile, voter };
  } catch (err) {
    if (import.meta.env.DEV) console.error('[auth] voter login failed', err);
    throw err;
  }
}

export const signInWithMatric = signInVoter;

export async function requestVoterPasswordReset({ email, matric }) {
  const sb = requireClient();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanMatric = normalizeMatric(matric);
  if (!cleanEmail || !cleanMatric) throw new Error('Enter your registered email and matric number.');
  if (!EMAIL_RE.test(cleanEmail)) throw new Error('Enter a valid email address.');
  const res = await sb.rpc('request_voter_password_reset', {
    p_email: cleanEmail,
    p_matric: cleanMatric
  });
  if (res.error) {
    console.error('[auth] password reset request failed', res.error);
    throw new Error('Unable to submit the reset request right now.');
  }
  return 'If your record matches, a reset request will be sent for review.';
}

export async function changeVoterPassword({ voterId, voterMatric, currentPassword, newPassword, confirmPassword }) {
  const sb = requireClient();
  const currentSecret = String(currentPassword || '');
  const nextSecret = String(newPassword || '');
  const confirmSecret = String(confirmPassword || '');
  if (!currentSecret || !nextSecret || !confirmSecret) throw new Error('Complete temporary password, new password, and confirmation.');
  if (nextSecret !== confirmSecret) throw new Error('Passwords do not match.');
  if (nextSecret.length < 6) throw new Error('New password must be at least 6 characters.');
  if (voterMatric && normalizeMatric(nextSecret) === normalizeMatric(voterMatric)) {
    throw new Error('New password must not be your matric number.');
  }

  const res = await sb.rpc('change_voter_password', {
    p_voter_id: voterId,
    p_current_password: currentSecret,
    p_new_password: nextSecret
  }).maybeSingle();
  if (res.error) throw new Error(cleanSupabaseMessage(res.error));
  if (!res.data) throw new Error('Unable to update voter password.');
  const voter = normalizeVoterRecord(res.data);
  updateStoredVoter(voter);
  return voter;
}

export async function registerVoter(registration) {
  const sb = requireClient();
  const payload = {
    full_name: registration.full_name.trim(),
    matric: normalizeMatric(registration.matric),
    department: registration.department,
    level: registration.level,
    email: registration.email.trim().toLowerCase()
  };
  if (Object.values(payload).some((value) => !String(value || '').trim())) {
    throw new Error('Complete all voter registration fields.');
  }
  if (!EMAIL_RE.test(payload.email)) throw new Error('Enter a valid voter email address.');

  await validateVoterIsUnique(sb, payload.matric, payload.email);

  const registerRes = await sb.rpc('register_voter', {
    p_full_name: payload.full_name,
    p_matric: payload.matric,
    p_department: payload.department,
    p_level: payload.level,
    p_email: payload.email,
    p_auth_user_id: null
  });
  if (registerRes.error) throw new Error(cleanSupabaseMessage(registerRes.error));
  return registerRes.data?.[0] || null;
}

async function validateVoterIsUnique(sb, matric, email, excludeId = null) {
  const duplicate = await sb.rpc('check_voter_duplicate', {
    p_matric: normalizeMatric(matric),
    p_email: String(email || '').trim().toLowerCase(),
    p_exclude_id: excludeId
  }).maybeSingle();

  if (duplicate.error) {
    if (isMissingRpc(duplicate.error)) return;
    throw new Error(cleanSupabaseMessage(duplicate.error));
  }
  if (duplicate.data?.matric_exists) throw new Error('A voter with this matric number already exists.');
  if (duplicate.data?.email_exists) throw new Error('This email is already registered.');
}

export async function signInAdmin(email, password) {
  const sb = requireClient();
  try {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) throw new Error('Enter admin email and password.');

    console.log('[auth] admin signInWithPassword start', { email: cleanEmail });
    const authRes = await sb.auth.signInWithPassword({ email: cleanEmail, password });
    console.log('[auth] admin signInWithPassword response', {
      hasUser: Boolean(authRes.data?.user),
      userId: authRes.data?.user?.id || null,
      hasSession: Boolean(authRes.data?.session)
    });
    if (authRes.error) console.error('[auth] admin signInWithPassword error', authRes.error);

    if (authRes.error) {
      throw new Error(authRes.error.message || 'Unable to sign in.');
    }

    const user = authRes.data?.user;
    if (!user) throw new Error('Supabase Auth did not return a user.');
    console.log('[auth] admin user id', user.id);

    console.log('[auth] admin profile fetch start', { profileId: user.id });
    const profileRes = await sb.from('profiles').select('id, full_name, role').eq('id', user.id).maybeSingle();
    console.log('[auth] admin profile fetch response', {
      profileId: user.id,
      hasProfile: Boolean(profileRes.data),
      role: profileRes.data?.role || null
    });
    if (profileRes.error) console.error('[auth] admin profile fetch error', profileRes.error);

    if (profileRes.error) throw new Error(profileRes.error.message || 'Unable to load admin profile.');
    if (!profileRes.data) {
      await sb.auth.signOut();
      throw new Error(`Missing admin profile. Add a row in public.profiles with id ${user.id}.`);
    }

    const role = normalizeRole(profileRes.data.role);
    console.log('[auth] admin role', role);

    if (!['superadmin', 'commissioner', 'observer'].includes(role)) {
      await sb.auth.signOut();
      throw new Error(`Unauthorized admin access. This account role (${profileRes.data.role || 'none'}) is not allowed. Allowed roles: superadmin, commissioner, observer.`);
    }

    return { user, profile: { ...profileRes.data, role } };
  } catch (err) {
    console.error('[auth] admin login failed', err);
    throw err;
  }
}

export async function getProfile(user) {
  if (!user) return null;
  const sb = requireClient();
  const profileRes = await sb.from('profiles').select('full_name, role').eq('id', user.id).maybeSingle();
  console.log('[auth] profile query result', { userId: user.id, profileRes });
  if (profileRes.error) throw profileRes.error;
  if (!profileRes.data) throw new Error('No profile row exists for this auth user.');
  return { ...profileRes.data, role: normalizeRole(profileRes.data.role) };
}

export async function getLinkedVoter(user) {
  if (!user?.id) return null;
  const sb = requireClient();
  const byAuth = await selectSafeVoters((columns) => sb.from('voters').select(columns).eq('auth_user_id', user.id).maybeSingle());
  if (!byAuth.error && byAuth.data) return byAuth.data;
  const byEmail = await selectSafeVoters((columns) => sb.from('voters').select(columns).eq('email', user.email).maybeSingle());
  if (byEmail.error) return null;
  return byEmail.data;
}

export async function signOut() {
  const sb = requireClient();
  clearAuthStorage();
  await sb.auth.signOut();
}

export function getStoredVoterSession() {
  try {
    const raw = localStorage.getItem(VOTER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.profile?.role !== 'voter' || !parsed?.voter?.id) return null;
    return parsed;
  } catch (err) {
    console.error('[auth] stored voter session read failed', err);
    localStorage.removeItem(VOTER_SESSION_KEY);
    return null;
  }
}

export async function castBallot(voter, selections) {
  const sb = requireClient();
  const payload = Object.entries(selections).map(([positionId, candidateId]) => ({ position_id: positionId, candidate_id: candidateId }));
  if (!payload.length || payload.some((item) => !item.position_id || !item.candidate_id)) {
    throw new Error('Select one valid candidate for every position before submitting.');
  }
  const res = await sb.rpc('cast_ballot', {
    p_matric: voter.matric,
    p_department: voter.department,
    p_email: voter.email,
    p_selections: payload
  });
  if (res.error) {
    console.error('cast_ballot failed:', res.error);
    const err = new Error(cleanSupabaseMessage(res.error));
    err.supabaseError = res.error;
    err.debugMessage = [
      res.error.message,
      res.error.details && `details: ${res.error.details}`,
      res.error.hint && `hint: ${res.error.hint}`,
      res.error.code && `code: ${res.error.code}`
    ].filter(Boolean).join('\n');
    throw err;
  }
  return res.data?.[0] || null;
}

export async function getVoterBallotStatus(electionId, voterId) {
  if (!electionId || !voterId) return null;
  const sb = requireClient();
  const res = await sb.rpc('get_voter_ballot_status_safe', {
    p_election_id: electionId,
    p_voter_id: voterId
  }).maybeSingle();
  if (!res.error) return normalizeReceiptRecord(res.data);
  if (!isMissingRpc(res.error)) {
    console.warn('[supabase] get_voter_ballot_status_safe RPC failed; trying direct receipt lookup', res.error);
  } else {
    console.warn('[supabase] get_voter_ballot_status_safe RPC missing; trying direct receipt lookup', res.error);
  }

  const ballotRes = await sb
    .from('ballots')
    .select('receipt_hash, block_hash, block_number, validation_status, anonymous_verification_id, confirmation_count, validator_votes, created_at, blocks(receipt_hash, block_hash, block_number, validation_status, anonymous_verification_id, confirmation_count, validator_votes, created_at)')
    .eq('election_id', electionId)
    .eq('voter_id', voterId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ballotRes.error) return normalizeReceiptRecord(ballotRes.data);

  const blockRes = await sb
    .from('blocks')
    .select('receipt_hash, block_hash, block_number, validation_status, anonymous_verification_id, confirmation_count, validator_votes, created_at')
    .eq('election_id', electionId)
    .eq('voter_id', voterId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!blockRes.error) return normalizeReceiptRecord(blockRes.data);
  console.warn('[supabase] direct voter receipt lookup failed', { ballotError: ballotRes.error, blockError: blockRes.error });
  return null;
}

export async function refreshVoterElectionStatus(voter, electionId) {
  if (!voter?.id) return { voter: null, ballot: null };
  const sb = requireClient();
  const [voterRes, ballot] = await Promise.all([
    voter.matric && voter.department && voter.email
      ? sb.rpc('verify_voter', {
          p_matric: voter.matric,
          p_department: voter.department,
          p_email: voter.email
        }).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    getVoterBallotStatus(electionId, voter.id)
  ]);

  if (voterRes.error) throw new Error(cleanSupabaseMessage(voterRes.error));
  const freshVoter = normalizeVoterRecord(voterRes.data || voter, voter);
  const nextVoter = freshVoter ? { ...freshVoter, has_voted: Boolean(freshVoter.has_voted || ballot?.has_ballot) } : null;
  if (nextVoter) updateStoredVoter(nextVoter);
  return { voter: nextVoter, ballot };
}

export async function verifyVoteReceipt(receiptHash) {
  const sb = requireClient();
  const cleanHash = String(receiptHash || '').trim();
  if (!cleanHash) throw new Error('Enter a receipt hash or block hash to verify.');
  const res = await sb.rpc('verify_vote_receipt', { p_receipt_hash: cleanHash }).maybeSingle();
  if (!res.error && res.data?.exists_on_chain) return res.data;

  const ledgerRes = await sb
    .from('blockchain_ledger')
    .select('election_id, election_title, ledger_status, block_number, receipt_hash, block_hash, validation_status, consensus_status, validator_status, confirmation_count, validator_votes, created_at')
    .or(`receipt_hash.eq.${cleanHash},block_hash.eq.${cleanHash}`)
    .maybeSingle();
  if (ledgerRes.error) throw new Error(cleanSupabaseMessage(ledgerRes.error));
  if (!ledgerRes.data) throw new Error('Hash was not found on the WUCC blockchain ledger.');
  return {
    ...ledgerRes.data,
    exists_on_chain: true,
    validation_status: ledgerRes.data.validation_status || ledgerRes.data.consensus_status || ledgerRes.data.validator_status || 'confirmed'
  };
}

export async function saveElectionSettings({ title, status, startsAt, endsAt }) {
  const sb = requireClient();
  const validStatuses = ['inactive', 'standby', 'active', 'ended', 'finalized'];
  if (!title.trim()) throw new Error('Election title is required.');
  if (!validStatuses.includes(status)) throw new Error('Invalid election status.');
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) throw new Error('End date must be after start date.');
  const rpc = await sb.rpc('update_current_election_settings', {
    p_title: title.trim(),
    p_status: status,
    p_starts_at: startsAt || null,
    p_ends_at: endsAt || null
  });
  if (!rpc.error) return;
  console.error('[supabase] update_current_election_settings RPC failed', rpc.error);

  const current = await sb.from('elections').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (current.error) {
    console.error('[supabase] current election lookup failed', current.error);
    throw current.error;
  }
  const payload = { title: title.trim(), status, starts_at: startsAt || null, ends_at: endsAt || null, updated_at: new Date().toISOString() };
  const res = current.data
    ? await sb.from('elections').update(payload).eq('id', current.data.id)
    : await sb.from('elections').insert(payload);
  if (res.error) {
    console.error('[supabase] election settings update failed', res.error);
    throw res.error;
  }
}

function isMissingRpc(error) {
  return missingRpcCodes.has(error?.code);
}

export async function resetElectionData() {
  const sb = requireClient();
  const res = await sb.rpc('reset_current_election_data');
  if (res.error) {
    console.error('[supabase] reset_current_election_data RPC failed', res.error);
    throw res.error;
  }
}

export async function createNewElectionCycle({ title, academicYear, startsAt, endsAt, keepApprovedVoters, reopenCandidateApplications }) {
  const sb = requireClient();
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) throw new Error('Election title is required.');
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) throw new Error('End date must be after start date.');

  const res = await sb.rpc('create_new_election_cycle', {
    p_title: cleanTitle,
    p_academic_year: String(academicYear || '').trim() || null,
    p_starts_at: startsAt || null,
    p_ends_at: endsAt || null,
    p_keep_approved_voters: Boolean(keepApprovedVoters),
    p_reopen_candidate_applications: Boolean(reopenCandidateApplications)
  });
  if (res.error) {
    console.error('[supabase] create_new_election_cycle RPC failed', res.error);
    throw new Error(cleanSupabaseMessage(res.error));
  }
  applicationPositionsCache = null;
  return Array.isArray(res.data) ? res.data[0] || null : res.data || null;
}

export async function upsertVoter(voter) {
  const sb = requireClient();
  const required = ['full_name', 'matric', 'department', 'level', 'email'];
  const missing = required.find((key) => !String(voter[key] || '').trim());
  if (missing) throw new Error('Complete full name, matric number, department, level, and email.');
  const payload = {
    full_name: voter.full_name.trim(),
    matric: normalizeMatric(voter.matric),
    department: voter.department,
    level: voter.level || null,
    email: voter.email.trim().toLowerCase(),
    status: voter.status || 'pending',
    auth_user_id: voter.auth_user_id || null
  };
  if (!EMAIL_RE.test(payload.email)) throw new Error('Enter a valid voter email address.');
  await validateVoterIsUnique(sb, payload.matric, payload.email, voter.id || null);
  const res = voter.id
    ? await sb.from('voters').update(payload).eq('id', voter.id)
    : await sb.from('voters').insert(payload);
  if (res.error) throw new Error(cleanSupabaseMessage(res.error));
}

export async function updateVoterStatus(id, status, reason = '') {
  const sb = requireClient();
  const res = await sb.rpc('set_voter_status', { p_voter_id: id, p_status: status });
  if (res.error) throw new Error(cleanSupabaseMessage(res.error));
  if (status === 'rejected' && reason.trim()) {
    const reasonRes = await sb.from('voters').update({ rejection_reason: reason.trim() }).eq('id', id);
    if (reasonRes.error && !/rejection_reason/i.test(reasonRes.error.message || '')) throw new Error(cleanSupabaseMessage(reasonRes.error));
  }
}

export async function approveVoterPasswordReset(requestId, temporaryPassword) {
  const sb = requireClient();
  const res = await sb.rpc('approve_voter_password_reset', {
    p_request_id: requestId,
    p_temporary_password: String(temporaryPassword || '')
  }).maybeSingle();
  if (res.error) throw new Error(cleanSupabaseMessage(res.error));
  return res.data || null;
}

export async function rejectVoterPasswordReset(requestId, reason = '') {
  const sb = requireClient();
  const res = await sb.rpc('reject_voter_password_reset', {
    p_request_id: requestId,
    p_reason: String(reason || '').trim()
  }).maybeSingle();
  if (res.error) throw new Error(cleanSupabaseMessage(res.error));
  return res.data || null;
}

export async function deleteVoter(id) {
  const sb = requireClient();
  const res = await sb.rpc('delete_voter', { p_voter_id: id });
  if (!res.error) return;

  console.error('[supabase] delete_voter RPC failed', res.error);
  if (!isMissingRpc(res.error)) throw new Error(cleanSupabaseMessage(res.error));

  const fallback = await sb.from('voters').delete().eq('id', id).select('id');
  if (fallback.error) {
    console.error('[supabase] voters delete failed', fallback.error);
    throw new Error(cleanSupabaseMessage(fallback.error));
  }
  if (!fallback.data?.length) throw new Error('Voter record was not deleted. Check election status and admin permissions.');
}

export async function updateApplicationStatus(id, status, reason = '') {
  const sb = requireClient();
  const res = await sb.rpc('set_candidate_application_status', { p_application_id: id, p_status: status });
  if (res.error) throw new Error(cleanSupabaseMessage(res.error));
  if (status === 'rejected' && reason.trim()) {
    const reasonRes = await sb.from('candidate_applications').update({ rejection_reason: reason.trim() }).eq('id', id);
    if (reasonRes.error && !/rejection_reason/i.test(reasonRes.error.message || '')) throw new Error(cleanSupabaseMessage(reasonRes.error));
  }
}

export async function updateCandidateStatus(id, status, reason = '') {
  const sb = requireClient();
  const res = await sb.rpc('set_candidate_status', { p_candidate_id: id, p_status: status });
  if (res.error) throw new Error(cleanSupabaseMessage(res.error));
  if (status === 'rejected' && reason.trim()) {
    const reasonRes = await sb.from('candidates').update({ rejection_reason: reason.trim() }).eq('id', id);
    if (reasonRes.error && !/rejection_reason/i.test(reasonRes.error.message || '')) throw new Error(cleanSupabaseMessage(reasonRes.error));
  }
}

export async function deleteCandidate(id) {
  const sb = requireClient();
  const res = await sb.rpc('delete_candidate', { p_candidate_id: id });
  if (!res.error) return;

  console.error('[supabase] delete_candidate RPC failed', res.error);
  if (!isMissingRpc(res.error)) throw new Error(cleanSupabaseMessage(res.error));

  const fallback = await sb.from('candidates').delete().eq('id', id).select('id');
  if (fallback.error) {
    console.error('[supabase] candidates delete failed', fallback.error);
    throw new Error(cleanSupabaseMessage(fallback.error));
  }
  if (!fallback.data?.length) throw new Error('Candidate record was not deleted. Check election status and admin permissions.');
}

export async function deleteCandidateApplication(id) {
  const sb = requireClient();
  const res = await sb.rpc('delete_candidate_application', { p_application_id: id });
  if (!res.error) return;

  console.error('[supabase] delete_candidate_application RPC failed', res.error);
  if (!isMissingRpc(res.error)) throw new Error(cleanSupabaseMessage(res.error));

  const fallback = await sb.from('candidate_applications').delete().eq('id', id).select('id');
  if (fallback.error) {
    console.error('[supabase] candidate_applications delete failed', fallback.error);
    throw new Error(cleanSupabaseMessage(fallback.error));
  }
  if (!fallback.data?.length) throw new Error('Candidate application was not deleted. Check election status and admin permissions.');
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function optimizeCandidatePhoto(file) {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = imageUrl;
    });

    const scale = Math.min(1, CANDIDATE_PHOTO_MAX_WIDTH / image.width);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { blob: file, extension: file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg', type: file.type };
    ctx.drawImage(image, 0, 0, width, height);

    const outputType = file.type === 'image/png' ? 'image/jpeg' : 'image/webp';
    const fallbackType = 'image/jpeg';
    const qualities = [0.82, 0.74, 0.66, 0.58];
    let best = null;
    for (const quality of qualities) {
      const blob = await canvasToBlob(canvas, outputType, quality) || await canvasToBlob(canvas, fallbackType, quality);
      if (!blob) continue;
      best = blob;
      if (blob.size <= CANDIDATE_PHOTO_MAX_BYTES) break;
    }

    if (!best || best.size > file.size) {
      return { blob: file, extension: file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg', type: file.type };
    }

    return {
      blob: best,
      extension: best.type === 'image/webp' ? 'webp' : 'jpg',
      type: best.type || outputType
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export async function uploadCandidatePhoto(file, matric) {
  const sb = requireClient();
  if (!file) return '';
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    throw new Error('Photo must be JPG, PNG or WEBP.');
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error('Photo must be under 2MB.');
  }

  const optimized = await optimizeCandidatePhoto(file);
  const extension = optimized.extension;
  const safeMatric = normalizeMatric(matric || 'candidate').replace(/[^A-Z0-9-]/g, '-').toLowerCase();
  const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${safeMatric}/${uniqueId}.${extension}`;
  const res = await sb.storage.from(CANDIDATE_PHOTO_BUCKET).upload(path, optimized.blob, {
    cacheControl: '3600',
    contentType: optimized.type,
    upsert: false
  });
  if (res.error) {
    console.error('[supabase] candidate photo upload failed', res.error);
    throw new Error('Candidate photo upload failed. Please try again or submit without a photo.');
  }

  const publicUrl = sb.storage.from(CANDIDATE_PHOTO_BUCKET).getPublicUrl(res.data.path).data?.publicUrl;
  return publicUrl || res.data.path;
}

export async function loadApplicationPositions() {
  const sb = requireClient();
  if (applicationPositionsCache?.length) return applicationPositionsCache;

  const [latestElection, positionsRes] = await Promise.all([
    fetchLatestElectionForApplications(sb),
    sb
      .from('positions')
      .select('id, election_id, slug, title, display_order, is_active')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
  ]);

  if (positionsRes.error) {
    console.error('[supabase] failed to fetch application positions', positionsRes.error);
    throw positionsRes.error;
  }

  const allPositions = positionsRes.data || [];
  if (!allPositions.length) return [];

  const latestElectionPositions = latestElection?.id
    ? allPositions.filter((position) => position.election_id === latestElection.id)
    : [];
  const scopedPositions = latestElectionPositions.length
    ? latestElectionPositions
    : allPositions;

  const seen = new Set();
  const positions = sortWuccPositions(scopedPositions.map((position) => ({
    ...position,
    title: getWuccPositionTitle(position),
    original_title: position.title
  }))).filter((position) => {
    const key = position.slug || position.title || position.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);

  console.log('[supabase] application positions fetched', {
    count: positions.length,
    electionId: latestElection?.id || null,
    positions: positions.map((position) => ({
      id: position.id,
      slug: position.slug,
      title: position.title,
      display_order: position.display_order
    }))
  });

  applicationPositionsCache = positions;
  return positions;
}

async function fetchLatestElectionForApplications(sb) {
  let electionRes = await sb
    .from('elections')
    .select('id, status, candidate_applications_open, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (electionRes.error && /candidate_applications_open/i.test(electionRes.error.message || '')) {
    electionRes = await sb
      .from('elections')
      .select('id, status, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
  }
  if (electionRes.error) {
    console.error('[supabase] latest election lookup failed for application positions', electionRes.error);
    return null;
  }
  return electionRes.data || null;
}

async function resolveApplicationElection(sb, knownPositions = null) {
  let electionsRes = await sb
    .from('elections')
    .select('id, status, candidate_applications_open, created_at')
    .order('created_at', { ascending: false });
  if (electionsRes.error && /candidate_applications_open/i.test(electionsRes.error.message || '')) {
    electionsRes = await sb
      .from('elections')
      .select('id, status, created_at')
      .order('created_at', { ascending: false });
  }
  if (electionsRes.error) throw electionsRes.error;

  const elections = electionsRes.data || [];
  const positionRows = knownPositions || await (async () => {
    const positionsRes = await sb
      .from('positions')
      .select('id, election_id, is_active')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (positionsRes.error) throw positionsRes.error;
    return positionsRes.data || [];
  })();
  const electionIdsWithPositions = new Set(positionRows.map((position) => position.election_id).filter(Boolean));
  const positionCountByElection = positionRows.reduce((map, position) => {
    if (!position.election_id) return map;
    map.set(position.election_id, (map.get(position.election_id) || 0) + 1);
    return map;
  }, new Map());

  for (const election of elections) {
    const status = String(election.status || '').toLowerCase();
    if (!['active', 'standby', 'inactive'].includes(status)) continue;
    if ((positionCountByElection.get(election.id) || 0) >= 10) return election;
  }

  for (const election of elections) {
    if ((positionCountByElection.get(election.id) || 0) >= 10) return election;
  }

  for (const election of elections) {
    const status = String(election.status || '').toLowerCase();
    if (!['active', 'standby', 'inactive'].includes(status)) continue;
    if (electionIdsWithPositions.has(election.id)) return election;
  }

  for (const election of elections) {
    if (electionIdsWithPositions.has(election.id)) return election;
  }

  return elections[0] || null;
}

function normalizePositionLookup(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/public relation officer/g, 'pro')
    .replace(/director of sport$/g, 'director of sports')
    .replace(/\s+/g, ' ');
}

async function resolveApplicationPosition(sb, application, electionId) {
  const rawPositionId = String(application.position_id || '').trim();
  if (UUID_RE.test(rawPositionId)) {
    const position = await sb
      .from('positions')
      .select('id')
      .eq('id', rawPositionId)
      .eq('election_id', electionId)
      .eq('is_active', true)
      .maybeSingle();
    if (position.error) throw position.error;
    if (position.data) return position.data.id;
  }

  const lookup = normalizePositionLookup(application.position_title || rawPositionId);
  if (!lookup) throw new Error('Select a valid position before submitting.');

  const positions = await sb
    .from('positions')
    .select('id, slug, title, display_order')
    .eq('election_id', electionId)
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  if (positions.error) throw positions.error;

  const match = (positions.data || []).find((position) => {
    const labels = [position.slug, position.title, getWuccPositionTitle(position)];
    return labels.some((label) => normalizePositionLookup(label) === lookup);
  });

  if (!match) throw new Error('Select a valid WUCC position before submitting.');
  return match.id;
}

export async function submitCandidateApplication(application) {
  const sb = requireClient();
  const cgpa = Number(application.cgpa);
  if (!Number.isFinite(cgpa) || cgpa < 3 || cgpa > 5) {
    throw new Error('CGPA is required and must be between 3.0 and 5.0.');
  }
  const current = await resolveApplicationElection(sb);
  if (!current) throw new Error('No election exists yet.');
  const currentStatus = String(current.status || '').toLowerCase();
  if (!['inactive', 'standby'].includes(currentStatus) || current.candidate_applications_open === false) {
    throw new Error('Applications are closed for the current election cycle.');
  }
  const positionId = await resolveApplicationPosition(sb, application, current.id);
  const matric = normalizeMatric(application.matric);
  const email = String(application.email || '').trim().toLowerCase();

  if (!matric) throw new Error('Matric number is required.');
  if (email && !EMAIL_RE.test(email)) throw new Error('Enter a valid email address.');

  const duplicate = await sb.rpc('check_candidate_application_duplicate', {
    p_election_id: current.id,
    p_position_id: positionId,
    p_matric: matric,
    p_email: email || null
  }).maybeSingle();
  if (duplicate.error && !isMissingRpc(duplicate.error)) throw new Error(cleanSupabaseMessage(duplicate.error));
  if (duplicate.data?.application_exists) throw new Error('You already have a candidate application for this position.');
  if (duplicate.data?.approved_candidate_exists) throw new Error('An approved candidate with this matric number already exists.');
  if (duplicate.data?.email_exists) throw new Error('This email is already registered for a candidate application.');

  const res = await sb.from('candidate_applications').insert({
    election_id: current.id,
    position_id: positionId,
    full_name: application.full_name,
    matric,
    department: application.department,
    level: application.level,
    email,
    phone: application.phone,
    manifesto: application.manifesto,
    promises: application.promises,
    cgpa: cgpa.toFixed(2),
    previous_role: application.previous_role,
    photo_url: application.photo_url,
    status: 'pending',
    reference: `VC-${Date.now().toString(36).toUpperCase()}`
  });
  if (res.error) throw new Error(cleanSupabaseMessage(res.error));
}

export function subscribeToElectionChanges(onChange) {
  if (!supabase) return () => {};
  const groups = [
    ['elections', 'positions', 'candidates', 'voters', 'candidate_applications', 'voter_password_reset_requests'],
    ['blocks', 'ballots', 'votes', 'audit_logs']
  ];
  const channels = groups.map((tables, index) => {
    const channel = supabase.channel(`votechain-realtime-${index + 1}`);
    tables.forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
    });
    channel.subscribe();
    return channel;
  });
  return () => {
    channels.forEach((channel) => supabase.removeChannel(channel));
  };
}

function normalizeMatric(value) {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
}

function cleanSupabaseMessage(error) {
  const message = error?.message || 'Database operation failed.';
  if (/duplicate key|unique constraint/i.test(message)) {
    if (/candidate_applications.*email|candidate_applications_unique_position_email/i.test(message)) return 'This email is already registered for a candidate application.';
    if (/candidate_applications.*matric|candidate_applications_unique_position_matric/i.test(message)) return 'You already have a candidate application for this position.';
    if (/candidate.*email|candidates_approved_email/i.test(message)) return 'An approved candidate with this email already exists.';
    if (/candidate.*matric|candidates_approved_matric/i.test(message)) return 'An approved candidate with this matric number already exists.';
    if (/email/i.test(message)) return 'This email is already registered.';
    if (/matric/i.test(message)) return 'A voter with this matric number already exists.';
    if (/receipt_hash/i.test(message)) return 'A blockchain receipt with this hash already exists. Try again.';
    if (/vote_hash/i.test(message)) return 'A blockchain vote hash already exists. Try again.';
    if (/block_hash/i.test(message)) return 'A blockchain block hash already exists. Try again.';
    if (/ballots|voter_id|position_id/i.test(message)) return 'This voter has already submitted a ballot.';
    return 'This voter record already exists.';
  }
  if (/Applications are closed for the current election cycle/i.test(message)) {
    return 'Applications are closed for the current election cycle.';
  }
  if (/already voted|already has voted|already submitted|duplicate ballot/i.test(message)) {
    return 'This voter has already submitted a ballot.';
  }
  if (/row-level security/i.test(message)) {
    return 'Database permissions blocked this action. Re-run the updated Supabase SQL setup.';
  }
  return message;
}
