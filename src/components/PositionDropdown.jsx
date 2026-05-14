import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export default function PositionDropdown({ value, options, loading = false, placeholder = 'Select position', getLabel, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = options.find((option) => option.id === value);

  useEffect(() => {
    function handleClick(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function handleKey(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative z-30">
      <button
        type="button"
        className={`input flex items-center justify-between gap-3 text-left ${open ? 'border-brand-500 ring-4 ring-brand-100 dark:ring-brand-900/40' : ''}`}
        onClick={() => !loading && setOpen((current) => !current)}
        disabled={loading}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-400'}>
          {loading ? 'Loading positions...' : selected ? getLabel(selected) : placeholder}
        </span>
        <ChevronDown className={`shrink-0 text-slate-400 transition ${open ? 'rotate-180 text-brand-600' : ''}`} size={18} />
      </button>

      {open && (
        <div className="position-dropdown-menu absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-72 origin-top overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-soft dark:border-slate-800 dark:bg-slate-900" role="listbox">
          {options.map((option) => {
            const active = option.id === value;
            return (
              <button
                type="button"
                key={option.id}
                className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm transition hover:bg-brand-50 hover:text-brand-700 focus:bg-brand-50 focus:text-brand-700 focus:outline-none dark:hover:bg-slate-800 dark:hover:text-brand-100 dark:focus:bg-slate-800 ${active ? 'bg-brand-50 font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-100' : 'text-slate-700 dark:text-slate-200'}`}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
                role="option"
                aria-selected={active}
              >
                <span>{getLabel(option)}</span>
                {active && <Check size={16} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
