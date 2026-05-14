import { Link } from 'react-router-dom';
import { Award, Blocks, CheckCircle2, FileCheck2, Fingerprint, LockKeyhole, Radio, ShieldCheck, UserPlus, Vote } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getWuccPositionTitle, sortWuccPositions, wuccPositionTitles } from '../constants/wuccPositions';
import { getElectionCountdown, getElectionPhase, getPhaseBadgeClass, getPhaseLabel } from '../utils/electionTiming';

const publicHeroTitle = 'WUCC';

const flow = [
  {
    icon: LockKeyhole,
    title: 'Secure login',
    text: 'Approved voters sign in through their verified account before accessing protected voting routes.'
  },
  {
    icon: UserPlus,
    title: 'Candidate application',
    text: 'Students apply for published offices, then election officers approve or reject applications before names enter the ballot.'
  },
  {
    icon: Vote,
    title: 'Ballot casting',
    text: 'Eligible voters select one candidate per position and submit a complete ballot during the active election window.'
  },
  {
    icon: Blocks,
    title: 'PBFT verification',
    text: 'Validator-style confirmation models the consortium blockchain flow before a ballot receipt is finalized.'
  },
  {
    icon: Fingerprint,
    title: 'Immutable results',
    text: 'Receipts, block numbers, and aggregate results create a transparent audit trail for defense review.'
  }
];

export default function Home({ data }) {
  const { election, positions, voters, ballots, stats, loading } = data;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const approved = stats?.approved_voters ?? voters.filter((voter) => voter.status === 'approved').length;
  const voted = stats?.voted_voters ?? voters.filter((voter) => voter.has_voted).length;
  const phase = getElectionPhase(election, now);
  const active = phase === 'active';
  const countdown = getElectionCountdown(election, phase, now);
  const displayPositions = positions.length
    ? sortWuccPositions(positions).slice(0, 10).map((position) => ({
        id: position.id,
        title: getWuccPositionTitle(position),
        candidates: position.candidates?.length || 0,
        live: true
      }))
    : wuccPositionTitles.map((title) => ({ id: title, title, candidates: 0, live: false }));

  return (
    <section className="home-landing space-y-10">
      <div className="home-hero">
        <div className="home-hero-copy">
          <div className="wucc-seal" aria-hidden="true">
            <ShieldCheck size={44} strokeWidth={2.2} />
          </div>
          <p className="wucc-overline"><span /> Wellspring University College of Science and Computing</p>
          <h1 className="home-title">{publicHeroTitle}</h1>
          <p className="home-subtitle">
            A clean, auditable election portal for candidate applications, secure voter access, PBFT-style validation, and immutable result tracking.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/apply" className="btn-primary bg-[#e84a1a] hover:bg-[#c93d13]"><FileCheck2 size={18} />Apply as candidate</Link>
            <Link to="/login" className="btn-secondary border-brand-200 bg-white text-brand-700 hover:bg-brand-50"><LockKeyhole size={18} />Secure login</Link>
          </div>
        </div>

        <div className="home-proof-panel">
          <div className={`wucc-live-badge ${active ? '' : 'off'}`}>{getPhaseLabel(phase)}</div>
          <p className="wucc-console-label">Consortium status</p>
          <h2>{publicHeroTitle}</h2>
          <div className="home-proof-grid">
            <div><strong>{loading ? '...' : approved}</strong><span>Approved voters</span></div>
            <div><strong>{loading ? '...' : voted}</strong><span>Votes cast</span></div>
            <div><strong>{loading ? '...' : displayPositions.length}</strong><span>Offices</span></div>
            <div><strong>{phase === 'ended' || phase === 'finalized' ? 'Voting Closed' : countdown.text}</strong><span>{countdown.label}</span></div>
          </div>
          <div className={`mt-4 inline-flex rounded-md px-3 py-2 text-sm font-bold ${getPhaseBadgeClass(phase)}`}>{phase === 'finalized' ? 'Ledger finalized and verified' : `${getPhaseLabel(phase)} election window`}</div>
          <div className="wucc-receipt-line">
            <Radio size={16} />
            <span>PBFT validator confirmation and receipt trail prepared for defense demonstration.</span>
          </div>
        </div>
      </div>

      <section className="home-positions">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e84a1a]">10 WUCC positions</p>
            <h2 className="text-2xl font-black tracking-tight">Positions open to candidates</h2>
          </div>
          <Link to="/apply" className="btn-secondary">Apply as candidate</Link>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {displayPositions.map((position, index) => (
            <Link
              key={position.id}
              to={position.live ? `/vote?position=${position.id}` : '/apply'}
              className="position-card group"
            >
              <span className="position-index">{String(index + 1).padStart(2, '0')}</span>
              <div className="position-icon"><Award size={21} /></div>
              <h3>{position.title}</h3>
              <p>{position.candidates} approved candidate{position.candidates === 1 ? '' : 's'}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e84a1a]">System workflow</p>
          <h2 className="text-2xl font-black tracking-tight">How the blockchain voting process works</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {flow.map((item) => (
            <div key={item.title} className="wucc-process">
              <div className="wucc-process-icon"><item.icon size={22} /></div>
              <h2>{item.title}</h2>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="home-cta">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ffb39b]">Candidate portal</p>
          <h2>Ready to contest for a WUCC office?</h2>
          <p>Submit your application for admin review. Approved candidates are automatically made available for voting.</p>
        </div>
        <Link to="/apply" className="btn-primary bg-white text-brand-700 hover:bg-brand-50"><CheckCircle2 size={18} />Apply as candidate</Link>
      </section>
    </section>
  );
}
