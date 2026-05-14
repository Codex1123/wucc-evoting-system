import { CheckCircle2, XCircle } from 'lucide-react';

export default function Toast({ type = 'success', children, onClose }) {
  if (!children) return null;
  const positive = type === 'success';

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        {positive ? <CheckCircle2 className="mt-0.5 text-emerald-600" size={18} /> : <XCircle className="mt-0.5 text-red-600" size={18} />}
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{children}</p>
        {onClose && (
          <button type="button" className="ml-2 text-xs font-bold text-slate-400 hover:text-slate-700 dark:hover:text-slate-100" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}
