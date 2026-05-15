import { Activity, Award, BarChart3, CircleDot, Hash, Lock, ShieldCheck, TrendingUp, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import SkeletonBlock from '../components/SkeletonBlock';
import StatCard from '../components/StatCard';
import StatusMessage from '../components/StatusMessage';
import { loadElectionResults } from '../services/electionService';
import { getElectionCountdown, getElectionPhase, getPhaseBadgeClass, getPhaseLabel } from '../utils/electionTiming';

const colors = ['#2563eb', '#0f766e', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#16a34a', '#be123c', '#4f46e5', '#64748b'];

function ResultsTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <p className="font-bold">{row.full_name}</p>
      <p className="text-slate-500 dark:text-slate-400">{row.votes} votes - {row.percentage}%</p>
    </div>
  );
}

function ResultProgress({ candidate, index, total, leading }) {
  const votes = Number(candidate.votes || 0);
  const pct = total ? Math.round((votes / total) * 1000) / 10 : 0;

  return (
    <div className={`rounded-lg border p-4 transition ${leading ? 'border-brand-200 bg-brand-50 dark:border-brand-900 dark:bg-brand-950/50' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/40'}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="truncate text-sm font-bold">{candidate.full_name}</div>
            {leading && <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-100">Leading</span>}
          </div>
          <div className="text-xs text-slate-500">{candidate.department || 'Department'} - {candidate.level || 'Level'}</div>
        </div>
        <div className="flex items-center gap-3 text-right">
          <div>
            <div className="text-base font-black">{votes}</div>
            <div className="text-xs text-slate-500">votes</div>
          </div>
          <div>
            <div className="text-base font-black">{pct}%</div>
            <div className="text-xs text-slate-500">share</div>
          </div>
        </div>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: colors[index % colors.length] }}
        />
      </div>
    </div>
  );
}

export default function Results({ data }) {
  const { election, elections = [], positions, ballots, stats, loading } = data;
  const [now, setNow] = useState(Date.now());
  const [selectedElectionId, setSelectedElectionId] = useState(election?.id || '');
  const [selectedResults, setSelectedResults] = useState(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState('');

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selectedElectionId && election?.id) setSelectedElectionId(election.id);
  }, [election?.id, selectedElectionId]);

  useEffect(() => {
    let mounted = true;
    async function loadSelectedElection() {
      if (!selectedElectionId || selectedElectionId === election?.id) {
        setSelectedResults(null);
        setResultsError('');
        return;
      }
      setResultsLoading(true);
      setResultsError('');
      try {
        const next = await loadElectionResults(selectedElectionId);
        if (mounted) setSelectedResults(next);
      } catch (err) {
        console.error('[results] selected election load failed', err);
        if (mounted) setResultsError('Unable to load the selected election results.');
      } finally {
        if (mounted) setResultsLoading(false);
      }
    }
    loadSelectedElection();
    return () => {
      mounted = false;
    };
  }, [selectedElectionId, election?.id]);

  const displayElection = selectedResults?.election || election;
  const displayPositions = selectedResults?.positions || positions;
  const displayBallots = selectedResults?.ballots || ballots;
  const displayStats = selectedResults?.stats || stats;
  const pageLoading = loading || resultsLoading;
  const totals = displayPositions.flatMap((position) => position.candidates.map((candidate) => ({ ...candidate, position: position.title })));
  const totalSelections = totals.reduce((sum, candidate) => sum + Number(candidate.votes || 0), 0);
  const leaders = displayPositions.map((position) => {
    const sorted = [...position.candidates].sort((a, b) => Number(b.votes || 0) - Number(a.votes || 0));
    return { position: position.title, leader: sorted[0], total: sorted.reduce((sum, c) => sum + Number(c.votes || 0), 0) };
  });
  const activeRaces = leaders.filter((leader) => leader.total > 0).length;
  const phase = getElectionPhase(displayElection, now);
  const countdown = getElectionCountdown(displayElection, phase, now);
  const activityStatus = getPhaseLabel(phase);
  const hasCandidates = displayPositions.some((position) => position.candidates.length);

  return (
    <section className="space-y-6">
      <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-600 via-[#e84a1a] to-brand-600" />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Live results</p>
            <h1 className="text-3xl font-black tracking-tight">{displayElection?.title || 'WUCC Election'}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {elections.length > 1 && (
              <select className="input min-h-10 w-full sm:w-72" value={selectedElectionId} onChange={(event) => setSelectedElectionId(event.target.value)}>
                {elections.map((item) => (
                  <option key={item.id} value={item.id}>{item.title || 'WUCC Election'} - {String(item.status || 'inactive')}</option>
                ))}
              </select>
            )}
            <span className={`badge ${getPhaseBadgeClass(phase)}`}>
              {phase === 'finalized' ? <ShieldCheck size={14} /> : <CircleDot className={phase === 'active' ? 'animate-pulse' : ''} size={14} />} {phase === 'finalized' ? 'Ledger finalized' : 'Live Supabase sync'}
            </span>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="text-xs text-slate-500">Election status</p><p className="font-bold">{getPhaseLabel(phase)}</p></div>
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="text-xs text-slate-500">{countdown.label}</p><p className="flex items-center gap-1 font-bold">{phase === 'ended' || phase === 'finalized' ? <><Lock size={15} />Voting Closed</> : countdown.text}</p></div>
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="text-xs text-slate-500">Ledger</p><p className="flex items-center gap-1 font-bold">{phase === 'finalized' ? <><Lock size={15} />Ledger Locked</> : 'PBFT syncing'}</p></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="badge bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"><ShieldCheck size={14} />Ledger synchronized</span>
          <span className="badge bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"><ShieldCheck size={14} />PBFT validated</span>
          {phase === 'finalized' && <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-100"><Lock size={14} />Election finalized</span>}
        </div>
      </div>
      <StatusMessage>{resultsError}</StatusMessage>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Total votes cast" value={pageLoading ? '...' : displayBallots.length} icon={Hash} />
        <StatCard title="Total selections" value={pageLoading ? '...' : totalSelections} icon={BarChart3} tone="green" />
        <StatCard title="Approved voters" value={pageLoading ? '...' : displayStats?.approved_voters ?? 0} icon={UsersRound} tone="amber" />
        <StatCard title="Activity" value={pageLoading ? '...' : activityStatus} icon={Activity} tone="slate" />
      </div>

      {pageLoading && (
        <div className="grid gap-5 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => <SkeletonBlock key={index} className="h-96" />)}
        </div>
      )}

      {!pageLoading && !displayPositions.length && (
        <div className="card grid place-items-center p-10 text-center">
          <Award className="mb-3 text-brand-600" size={34} />
          <h2 className="text-xl font-black">No results available</h2>
          <p className="mt-2 max-w-md text-sm text-slate-500">Results will appear here after positions and approved candidates are available.</p>
        </div>
      )}

      {!pageLoading && displayPositions.length > 0 && !hasCandidates && (
        <div className="card grid place-items-center p-10 text-center">
          <UsersRound className="mb-3 text-brand-600" size={34} />
          <h2 className="text-xl font-black">No candidates approved yet</h2>
          <p className="mt-2 max-w-md text-sm text-slate-500">Result charts will appear when approved candidates are added to the ballot.</p>
        </div>
      )}

      {!pageLoading && hasCandidates && totalSelections === 0 && (
        <div className="card grid place-items-center p-8 text-center">
          <BarChart3 className="mb-3 text-brand-600" size={32} />
          <h2 className="text-lg font-black">No votes yet</h2>
          <p className="mt-2 max-w-md text-sm text-slate-500">Confirmed ballots will update this page automatically after voting begins.</p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {displayPositions.map((position) => {
          const positionTotal = position.candidates.reduce((sum, c) => sum + Number(c.votes || 0), 0);
          const leaderVotes = Math.max(...position.candidates.map((c) => Number(c.votes || 0)), 0);
          const leader = [...position.candidates].sort((a, b) => Number(b.votes || 0) - Number(a.votes || 0))[0];
          const chartData = position.candidates.map((candidate) => ({
            ...candidate,
            votes: Number(candidate.votes || 0),
            percentage: positionTotal ? Math.round((Number(candidate.votes || 0) / positionTotal) * 1000) / 10 : 0
          }));
          const chartHeight = Math.max(300, chartData.length > 5 ? 350 : 300);

          return (
            <div key={position.id} className="card overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/30">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black tracking-tight">{position.title}</h2>
                    <p className="text-sm text-slate-500">{positionTotal} total votes recorded for this position</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{position.candidates.length} candidates</span>
                    <span className={leaderVotes > 0 ? 'badge bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-100' : 'badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}>
                      <TrendingUp size={14} /> {leaderVotes > 0 ? leader?.full_name : 'No leader yet'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-5 p-5">
                {chartData.length && positionTotal > 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/40" style={{ height: chartHeight }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 24, right: 18, bottom: 54, left: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" opacity={0.5} />
                        <XAxis dataKey="full_name" interval={0} height={70} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} angle={-18} textAnchor="end" />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                        <Tooltip content={<ResultsTooltip />} />
                        <Bar dataKey="votes" radius={[8, 8, 0, 0]} maxBarSize={52}>
                          <LabelList dataKey="votes" position="top" className="fill-slate-800 text-xs font-bold dark:fill-slate-100" />
                          {chartData.map((candidate, index) => <Cell key={candidate.id} fill={colors[index % colors.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="grid min-h-48 place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-950/40">
                    <div>
                      <BarChart3 className="mx-auto mb-3 text-brand-600" size={30} />
                      <h3 className="font-black">No votes recorded</h3>
                      <p className="mt-1 max-w-sm text-sm text-slate-500">This position will show a live vote chart after PBFT-confirmed ballots are recorded.</p>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {position.candidates.length ? position.candidates.map((candidate, index) => (
                    <ResultProgress
                      key={candidate.id}
                      candidate={candidate}
                      index={index}
                      total={positionTotal}
                      leading={Number(candidate.votes || 0) === leaderVotes && leaderVotes > 0}
                    />
                  )) : (
                    <div className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 dark:border-slate-700">
                      No approved candidates for this position yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Active races</p>
          <p className="mt-2 text-2xl font-black">{activeRaces}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Registered voters</p>
          <p className="mt-2 text-2xl font-black">{displayStats?.registered_voters ?? 0}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Voted voters</p>
          <p className="mt-2 text-2xl font-black">{displayStats?.voted_voters ?? displayBallots.length}</p>
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Verified blockchain receipts</h2>
            <p className="text-sm text-slate-500">Public ledger receipts confirm recorded ballots without exposing voter identity or selections.</p>
          </div>
          <span className="badge bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">PBFT consortium validation</span>
        </div>
        <div className="table-wrap">
          <table className="table min-w-[900px]">
            <thead><tr><th>Block</th><th>Receipt hash</th><th>Block hash</th><th>Status</th><th>Timestamp</th></tr></thead>
            <tbody>
              {displayBallots.length ? displayBallots.map((ballot) => (
                <tr key={ballot.receipt_hash || ballot.block_hash || ballot.block_number}>
                  <td>#{ballot.block_number}</td>
                  <td className="max-w-[260px] truncate font-mono text-xs">{ballot.receipt_hash}</td>
                  <td className="max-w-[260px] truncate font-mono text-xs">{ballot.block_hash}</td>
                  <td><span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{ballot.consensus_status || 'confirmed'}</span></td>
                  <td>{ballot.created_at ? new Date(ballot.created_at).toLocaleString() : 'N/A'}</td>
                </tr>
              )) : (
                <tr><td colSpan="5" className="text-center text-slate-500">No blockchain receipts recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
