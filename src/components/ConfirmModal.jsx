import { X } from 'lucide-react';

export default function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', loading = false, onConfirm, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black tracking-tight">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{message}</p>
          </div>
          <button type="button" className="btn-secondary h-9 w-9 p-0" onClick={onClose} disabled={loading} aria-label="Close">
            <X size={17} />
          </button>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button type="button" className="btn-primary" onClick={onConfirm} disabled={loading}>{loading ? 'Please wait...' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
