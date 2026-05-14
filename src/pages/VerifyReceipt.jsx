import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, ClipboardCheck, Radio, Search, ShieldCheck, XCircle } from 'lucide-react';
import StatusMessage from '../components/StatusMessage';
import { verifyVoteReceipt } from '../services/electionService';
import { getElectionPhase, getPhaseBadgeClass, getPhaseLabel } from '../utils/electionTiming';

export default function VerifyReceipt({ data }) {
  const [searchParams] = useSearchParams();
  const [receiptHash, setReceiptHash] = useState(searchParams.get('receipt') || searchParams.get('block') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const phase = getElectionPhase(data?.election);
  const validators = useMemo(() => {
    const votes = result?.validator_votes || {};
    return [
      ['Validator Node 1', votes.validator_1],
      ['Validator Node 2', votes.validator_2],
      ['Validator Node 3', votes.validator_3],
      ['Validator Node 4', votes.validator_4],
      ['Validator Node 5', votes.validator_5]
    ];
  }, [result]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const verified = await verifyVoteReceipt(receiptHash);
      setResult(verified);
    } catch (err) {
      console.error('[receipt] verification failed', err);
      setError(err.message || 'Unable to verify receipt.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Receipt verification</p>
        <h1 className="text-3xl font-black tracking-tight">Verify blockchain vote receipt</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Paste a receipt hash or block hash to confirm the record exists on the WUCC consortium blockchain ledger.</p>
        <span className={`mt-3 inline-flex badge ${getPhaseBadgeClass(phase)}`}>
          {phase === 'finalized' ? <ShieldCheck size={14} /> : null}{getPhaseLabel(phase)}
        </span>
      </div>

      <form onSubmit={submit} className="card space-y-4 p-5">
        <label>
          <span className="label">Receipt hash or block hash</span>
          <textarea
            className="input min-h-24 font-mono text-sm"
            value={receiptHash}
            onChange={(event) => setReceiptHash(event.target.value)}
            placeholder="0x..."
            required
          />
        </label>
        <StatusMessage>{error}</StatusMessage>
        <button className="btn-primary" disabled={loading}>
          {loading ? <Radio className="animate-pulse" size={18} /> : <Search size={18} />}{loading ? 'Verifying ledger...' : 'Verify hash'}
        </button>
      </form>

      {result && (
        <div className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Validation complete</p>
              <h2 className="text-xl font-black tracking-tight">Ledger record exists on-chain</h2>
            </div>
            <span className="badge bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"><ClipboardCheck size={14} />{result.ledger_status === 'finalized' ? 'Verified final ledger' : 'Verified'}</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Election</p>
              <p className="mt-1 text-sm font-bold">{result.election_title || data?.election?.title || 'WUCC Election'}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Ledger status</p>
              <p className="mt-1 text-sm font-bold capitalize">{result.ledger_status || data?.election?.ledger_status || 'open'}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Receipt hash</p>
              <p className="mt-1 break-all font-mono text-sm">{result.receipt_hash}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Block hash</p>
              <p className="mt-1 break-all font-mono text-sm">{result.block_hash}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Block number</p>
              <p className="mt-1 text-sm font-bold">#{result.block_number}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Validation status</p>
              <p className="mt-1 inline-flex items-center gap-2 text-sm font-bold"><CheckCircle2 className="text-emerald-600" size={16} />{result.validation_status}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">PBFT confirmations</p>
              <p className="mt-1 text-sm font-bold">{result.confirmation_count || '3+'}/5 validators</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800 md:col-span-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Validator consensus</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {validators.map(([label, confirmed]) => (
                  <span key={label} className={`badge ${confirmed ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                    {confirmed ? <CheckCircle2 size={14} /> : <XCircle size={14} />}{label}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800 md:col-span-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Timestamp</p>
              <p className="mt-1 text-sm font-bold">{result.created_at ? new Date(result.created_at).toLocaleString() : 'N/A'}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
