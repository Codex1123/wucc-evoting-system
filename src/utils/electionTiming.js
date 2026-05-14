export function getElectionPhase(election, nowValue = Date.now()) {
  const status = String(election?.status || 'inactive').toLowerCase();
  if (status === 'finalized') return 'finalized';
  if (status === 'inactive') return 'inactive';

  const now = typeof nowValue === 'number' ? nowValue : new Date(nowValue).getTime();
  const startsAt = election?.starts_at ? new Date(election.starts_at).getTime() : null;
  const endsAt = election?.ends_at ? new Date(election.ends_at).getTime() : null;

  if (endsAt && now >= endsAt) return 'ended';
  if (startsAt && now < startsAt) return 'standby';
  if (status === 'active' || (startsAt && endsAt && now >= startsAt && now < endsAt)) return 'active';
  return 'standby';
}

export function getElectionCountdown(election, phase, nowValue = Date.now()) {
  const now = typeof nowValue === 'number' ? nowValue : new Date(nowValue).getTime();
  const target = phase === 'standby' ? election?.starts_at : phase === 'active' ? election?.ends_at : null;
  if (!target) return { label: phase === 'standby' ? 'Awaiting schedule' : 'No active countdown', text: 'Not scheduled', ms: 0 };

  const ms = Math.max(0, new Date(target).getTime() - now);
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    label: phase === 'standby' ? 'Starts in' : 'Ends in',
    text: days > 0
      ? `${days}d ${hours}h ${minutes}m`
      : `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
    ms
  };
}

export function getPhaseLabel(phase) {
  return {
    standby: 'Standby',
    active: 'Active',
    ended: 'Ended',
    finalized: 'Ledger finalized',
    inactive: 'Inactive'
  }[phase] || 'Standby';
}

export function getPhaseBadgeClass(phase) {
  return {
    standby: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-100',
    active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100',
    ended: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    finalized: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-100',
    inactive: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
  }[phase] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
}
