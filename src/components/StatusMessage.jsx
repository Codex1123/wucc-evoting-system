import { AlertCircle, CheckCircle2 } from 'lucide-react';

export default function StatusMessage({ type = 'error', children }) {
  if (!children) return null;
  const ok = type === 'success';
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3.5 py-3 text-sm font-medium shadow-sm ${
      ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100' : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100'
    }`}>
      {ok ? <CheckCircle2 size={17} className="mt-0.5" /> : <AlertCircle size={17} className="mt-0.5" />}
      <span>{children}</span>
    </div>
  );
}
