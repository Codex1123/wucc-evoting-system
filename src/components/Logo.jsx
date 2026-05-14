import { ShieldCheck } from 'lucide-react';

export default function Logo({ compact = false }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-600 text-white shadow-sm ring-4 ring-brand-100 dark:ring-brand-900/50">
        <ShieldCheck size={24} strokeWidth={2.4} />
      </div>
      {!compact && (
        <div>
          <div className="text-lg font-black tracking-tight text-slate-950 dark:text-white">WUCC eVoting</div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Votechain election portal</div>
        </div>
      )}
    </div>
  );
}
