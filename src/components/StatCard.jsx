export default function StatCard({ title, value, icon: Icon, tone = 'blue' }) {
  const tones = {
    blue: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-100',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-100',
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100'
  };
  return (
    <div className="card p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
        </div>
        {Icon && <div className={`grid h-11 w-11 place-items-center rounded-lg ${tones[tone]}`}><Icon size={22} /></div>}
      </div>
    </div>
  );
}
