import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Archive, BarChart3, Blocks, Eye, FileText, Lock, ShieldCheck } from 'lucide-react';
import SkeletonBlock from '../components/SkeletonBlock';
import StatusMessage from '../components/StatusMessage';
import { loadElectionAuditTrail, loadElectionHistory, loadElectionLedger, loadElectionResults, logElectionViewed } from '../services/electionService';

const chartColors = ['#2563eb', '#0f766e', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#16a34a', '#be123c', '#4f46e5', '#64748b'];

function compactDate(value) {
  return value ? new Date(value).toLocaleString() : 'N/A';
}

function badgeClass(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'active') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100';
  if (value === 'finalized') return 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-100';
  if (value === 'ended') return 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-100';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
}

function ResultTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <p className="font-bold">{row.full_name}</p>
      <p className="text-slate-500 dark:text-slate-400">{row.votes} votes - {row.percentage}%</p>
    </div>
  );
}

function ResultsModal({ snapshot, loading, onClose }) {
  const positions = snapshot?.positions || [];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="card max-h-[90vh] w-full max-w-6xl overflow-y-auto p-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Finalized results</p>
            <h2 className="text-xl font-black tracking-tight">{snapshot?.election?.title || 'Election results'}</h2>
            <p className="mt-1 text-sm text-slate-500">Read-only election-scoped result archive.</p>
          </div>
          <button className="btn-secondary px-3 py-2" onClick={onClose}>Close</button>
        </div>
        {loading ? <SkeletonBlock className="h-96" /> : (
          <div className="grid gap-5 lg:grid-cols-2">
            {positions.length ? positions.map((position) => {
              const total = position.candidates.reduce((sum, candidate) => sum + Number(candidate.votes || 0), 0);
              const leaderVotes = Math.max(...position.candidates.map((candidate) => Number(candidate.votes || 0)), 0);
              const chartData = position.candidates.map((candidate) => ({
                ...candidate,
                votes: Number(candidate.votes || 0),
                percentage: total ? Math.round((Number(candidate.votes || 0) / total) * 1000) / 10 : 0
              }));
              return (
                <div key={position.id} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black">{position.title}</h3>
                      <p className="text-sm text-slate-500">{total} total votes</p>
                    </div>
                    <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-100">Read-only</span>
                  </div>
                  {chartData.length && total > 0 ? (
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 24, right: 18, bottom: 54, left: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" opacity={0.5} />
                          <XAxis dataKey="full_name" interval={0} height={70} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} angle={-18} textAnchor="end" />
                          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                          <Tooltip content={<ResultTooltip />} />
                          <Bar dataKey="votes" radius={[8, 8, 0, 0]} maxBarSize={52} isAnimationActive>
                            <LabelList dataKey="votes" position="top" className="fill-slate-800 text-xs font-bold dark:fill-slate-100" />
                            {chartData.map((candidate, index) => <Cell key={candidate.id} fill={chartColors[index % chartColors.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="grid min-h-48 place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-950/40">
                      <div>
                        <BarChart3 className="mx-auto mb-3 text-brand-600" size={30} />
                        <h3 className="font-black">No votes yet</h3>
                      </div>
                    </div>
                  )}
                  <div className="mt-4 space-y-2">
                    {chartData.map((candidate) => {
                      const leading = Number(candidate.votes || 0) === leaderVotes && leaderVotes > 0;
                      return (
                        <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900">
                          <span className="font-bold">{candidate.full_name}</span>
                          <span className="flex items-center gap-2">
                            {leading && <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-100">Leading candidate</span>}
                            <span>{candidate.votes} votes</span>
                            <span className="text-slate-500">{candidate.percentage}%</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }) : (
              <div className="card grid place-items-center p-10 text-center lg:col-span-2">
                <h3 className="font-black">No archived results found</h3>
                <p className="mt-2 text-sm text-slate-500">This election has no approved candidate results.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LedgerModal({ election, ledger, loading, onClose }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="card max-h-[90vh] w-full max-w-6xl overflow-y-auto p-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Blockchain ledger</p>
            <h2 className="text-xl font-black tracking-tight">{election?.title || 'Election ledger'}</h2>
            <p className="mt-1 text-sm text-slate-500">Receipts and blocks filtered by this election ID only.</p>
          </div>
          <button className="btn-secondary px-3 py-2" onClick={onClose}>Close</button>
        </div>
        {loading ? <SkeletonBlock className="h-72" /> : (
          <div className="table-wrap">
            <table className="table min-w-[900px]">
              <thead><tr><th>Block</th><th>Receipt hash</th><th>Block hash</th><th>PBFT status</th><th>Timestamp</th></tr></thead>
              <tbody>
                {ledger.length ? ledger.map((block) => (
                  <tr key={block.id || block.receipt_hash}>
                    <td className="font-bold">#{block.block_number}</td>
                    <td className="max-w-[260px] truncate font-mono text-xs">{block.receipt_hash}</td>
                    <td className="max-w-[260px] truncate font-mono text-xs">{block.block_hash}</td>
                    <td><span className="badge bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">{block.consensus_status || block.validation_status || 'confirmed'}</span></td>
                    <td>{compactDate(block.created_at)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="text-center text-slate-500">No blockchain blocks recorded for this election.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AuditModal({ election, rows, loading, onClose }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="card max-h-[90vh] w-full max-w-5xl overflow-y-auto p-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Audit trail</p>
            <h2 className="text-xl font-black tracking-tight">{election?.title || 'Election audit trail'}</h2>
            <p className="mt-1 text-sm text-slate-500">Read-only administrative and ledger events for this election.</p>
          </div>
          <button className="btn-secondary px-3 py-2" onClick={onClose}>Close</button>
        </div>
        {loading ? <SkeletonBlock className="h-72" /> : (
          <div className="space-y-3">
            {rows.length ? rows.map((log) => (
              <div key={log.id} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{log.action}</p>
                    <p className="mt-1 text-sm text-slate-500">{log.actor_role || 'system'} / {compactDate(log.created_at)}</p>
                  </div>
                  <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{log.record_table || 'system'}</span>
                </div>
                <p className="mt-3 break-words rounded bg-slate-50 p-3 font-mono text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">{log.details ? JSON.stringify(log.details) : 'N/A'}</p>
              </div>
            )) : (
              <div className="grid min-h-48 place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-950/40">
                <div>
                  <FileText className="mx-auto mb-3 text-brand-600" size={30} />
                  <h3 className="font-black">No audit events found</h3>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ElectionHistory() {
  const [elections, setElections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ledgerState, setLedgerState] = useState({ election: null, rows: [], loading: false });
  const [resultsState, setResultsState] = useState({ snapshot: null, loading: false });
  const [auditState, setAuditState] = useState({ election: null, rows: [], loading: false });
  const previousElections = useMemo(() => elections, [elections]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadElectionHistory()
      .then((rows) => {
        if (active) setElections(rows);
      })
      .catch((err) => {
        console.error('[history] election history load failed', err);
        if (active) setError(err.message || 'Unable to load election history.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function openLedger(election) {
    setLedgerState({ election, rows: [], loading: true });
    await logElectionViewed(election.id, 'ledger');
    try {
      const rows = await loadElectionLedger(election.id);
      setLedgerState({ election, rows, loading: false });
    } catch (err) {
      console.error('[history] election ledger load failed', err);
      setError(err.message || 'Unable to load election ledger.');
      setLedgerState({ election: null, rows: [], loading: false });
    }
  }

  async function openResults(election) {
    setResultsState({ snapshot: { election, positions: [], ballots: [], stats: null }, loading: true });
    await logElectionViewed(election.id, 'results');
    try {
      const snapshot = await loadElectionResults(election.id);
      setResultsState({ snapshot, loading: false });
    } catch (err) {
      console.error('[history] election results load failed', err);
      setError(err.message || 'Unable to load election results.');
      setResultsState({ snapshot: null, loading: false });
    }
  }

  async function openAudit(election) {
    setAuditState({ election, rows: [], loading: true });
    await logElectionViewed(election.id, 'audit');
    try {
      const rows = await loadElectionAuditTrail(election.id);
      setAuditState({ election, rows, loading: false });
    } catch (err) {
      console.error('[history] election audit load failed', err);
      setError(err.message || 'Unable to load election audit trail.');
      setAuditState({ election: null, rows: [], loading: false });
    }
  }

  return (
    <section className="space-y-6">
      <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-600 via-[#e84a1a] to-brand-600" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Administration</p>
            <h1 className="text-3xl font-black tracking-tight">Election History</h1>
            <p className="mt-2 text-sm text-slate-500">Finalized election ledgers remain immutable and permanently verifiable.</p>
          </div>
          <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-100"><Lock size={14} />Read-only archive</span>
        </div>
      </div>

      <StatusMessage>{error}</StatusMessage>

      {loading ? <SkeletonBlock className="h-96" /> : (
        <div className="grid gap-4">
          {previousElections.length ? previousElections.map((election) => (
            <article key={election.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-black tracking-tight">{election.title || 'WUCC Election'}</h2>
                    <span className={`badge ${badgeClass(election.status)}`}>{election.status || 'inactive'}</span>
                    <span className={`badge ${badgeClass(election.ledger_status === 'finalized' ? 'finalized' : 'inactive')}`}><ShieldCheck size={14} />{election.ledger_status || 'open'}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{election.academic_year || 'Academic year not set'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary" onClick={() => openResults(election)}><Eye size={17} />View Results</button>
                  <button className="btn-secondary" onClick={() => openLedger(election)}><Blocks size={17} />View Ledger</button>
                  <button className="btn-secondary" onClick={() => openAudit(election)}><FileText size={17} />View Audit Trail</button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                {[
                  ['Starts', compactDate(election.starts_at)],
                  ['Ends', compactDate(election.ends_at)],
                  ['Total voters', election.total_voters],
                  ['Votes cast', election.total_votes_cast],
                  ['Finalized', compactDate(election.finalized_at || election.archived_at)],
                  ['Created', compactDate(election.created_at)]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
                    <p className="mt-1 break-words font-semibold">{value ?? 'N/A'}</p>
                  </div>
                ))}
              </div>
            </article>
          )) : (
            <div className="card grid place-items-center p-10 text-center">
              <Archive className="mb-3 text-brand-600" size={34} />
              <h2 className="text-xl font-black">No election history found</h2>
              <p className="mt-2 text-sm text-slate-500">Completed election cycles will appear here.</p>
            </div>
          )}
        </div>
      )}

      {ledgerState.election && <LedgerModal election={ledgerState.election} ledger={ledgerState.rows} loading={ledgerState.loading} onClose={() => setLedgerState({ election: null, rows: [], loading: false })} />}
      {resultsState.snapshot && <ResultsModal snapshot={resultsState.snapshot} loading={resultsState.loading} onClose={() => setResultsState({ snapshot: null, loading: false })} />}
      {auditState.election && <AuditModal election={auditState.election} rows={auditState.rows} loading={auditState.loading} onClose={() => setAuditState({ election: null, rows: [], loading: false })} />}
    </section>
  );
}
