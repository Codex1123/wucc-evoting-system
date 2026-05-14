import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ImagePlus, Loader2, Send, UploadCloud } from 'lucide-react';
import PositionDropdown from '../components/PositionDropdown';
import StatusMessage from '../components/StatusMessage';
import { loadApplicationPositions, submitCandidateApplication, uploadCandidatePhoto } from '../services/electionService';
import { departmentOptions, levelOptions } from '../constants/formOptions';
import { getWuccPositionTitle, sortWuccPositions } from '../constants/wuccPositions';

const fallbackPositions = [
  'Governor',
  'Deputy Governor',
  'General Secretary',
  'Assistant General Secretary',
  'Financial Secretary',
  'Public Relations Officer',
  'Director of Welfare',
  'Director of Health',
  'Director of Sports',
  'Director of Socials'
].map((title, index) => ({
  id: `fallback-${index + 1}`,
  title,
  position_title: title,
  display_order: index + 1,
  isFallback: true
}));

const emptyApplication = { full_name: '', matric: '', department: '', level: '', email: '', phone: '', position_id: '', manifesto: '', promises: '', cgpa: '', previous_role: '', photo_url: '' };
const APPLY_DRAFT_KEY = 'wucc_apply_draft';

function readApplicationDraft() {
  try {
    const parsed = JSON.parse(localStorage.getItem(APPLY_DRAFT_KEY) || 'null');
    return parsed ? { ...emptyApplication, ...parsed, photo_url: '' } : emptyApplication;
  } catch {
    return emptyApplication;
  }
}

function displayPositionTitle(position) {
  return position?.isFallback ? position.title : getWuccPositionTitle(position);
}

export default function Apply({ data }) {
  const { positions, refresh } = data;
  const initialPositions = useMemo(() => sortWuccPositions(positions || []).slice(0, 10), [positions]);
  const [form, setForm] = useState(readApplicationDraft);
  const [preview, setPreview] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [positionOptions, setPositionOptions] = useState(initialPositions);
  const [positionsLoading, setPositionsLoading] = useState(true);
  const [positionsWarning, setPositionsWarning] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchPositions() {
      setPositionsLoading(true);
      setPositionsWarning('');
      try {
        const loaded = await loadApplicationPositions();
        if (cancelled) return;
        if (loaded.length) {
          setPositionOptions(loaded.slice(0, 10));
          setPositionsWarning('');
        } else {
          setPositionOptions([]);
          setPositionsWarning('No application positions are available for the current election cycle.');
        }
      } catch (err) {
        console.error('[apply] position fetch failed; using fallback positions', err);
        if (cancelled) return;
        setPositionOptions(initialPositions.length ? initialPositions : fallbackPositions);
        setPositionsWarning('Could not load positions from Supabase. Showing fallback positions.');
      } finally {
        if (!cancelled) setPositionsLoading(false);
      }
    }

    fetchPositions();
    return () => {
      cancelled = true;
    };
  }, [initialPositions]);

  useEffect(() => {
    const { photo_url, ...draft } = form;
    localStorage.setItem(APPLY_DRAFT_KEY, JSON.stringify(draft));
  }, [form]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectedPosition() {
    return positionOptions.find((position) => position.id === form.position_id);
  }

  function handlePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      setError('Photo must be JPG, PNG or WEBP.');
      setPhotoFile(null);
      setPreview('');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Photo must be under 2MB.');
      setPhotoFile(null);
      setPreview('');
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result);
    };
    reader.onerror = () => {
      setPhotoFile(null);
      setPreview('');
      setError('Unable to preview the selected photo. Please choose another image.');
    };
    reader.readAsDataURL(file);
  }

  function validate() {
    const messages = [];
    if (!form.full_name.trim()) messages.push('Full name is required.');
    if (!form.matric.trim()) messages.push('Matric number is required.');
    if (!form.department) messages.push('Select your department.');
    if (!form.level) messages.push('Select your level.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) messages.push('Enter a valid email address.');
    if (!form.position_id || !selectedPosition()) messages.push('Select the position you want to contest.');
    if (!form.manifesto.trim()) messages.push('Manifesto is required.');
    const cgpa = Number(form.cgpa);
    if (!Number.isFinite(cgpa) || cgpa < 3 || cgpa > 5) messages.push('CGPA must be between 3.0 and 5.0.');
    return messages;
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setSuccess('');
    const validationMessages = validate();
    if (validationMessages.length) return setError(validationMessages.join(' '));
    const cgpa = Number(form.cgpa);
    const position = selectedPosition();
    try {
      setSubmitting(true);
      const photoUrl = photoFile ? await uploadCandidatePhoto(photoFile, form.matric) : '';
      await submitCandidateApplication({
        ...form,
        photo_url: photoUrl,
        position_title: position?.position_title || displayPositionTitle(position),
        cgpa: cgpa.toFixed(2),
        promises: form.promises.split('\n').map((line) => line.trim()).filter(Boolean)
      });
      setSuccess('Application submitted for admin review.');
      setForm(emptyApplication);
      setPreview('');
      setPhotoFile(null);
      localStorage.removeItem(APPLY_DRAFT_KEY);
      await refresh();
    } catch (err) {
      console.error('[apply] application submission failed', err);
      if (/photo upload/i.test(err?.message || '')) {
        setPhotoFile(null);
        setPreview('');
      }
      setError(err.message || 'Unable to submit application.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Candidate application</p>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Apply to contest</h1>
        </div>
        <span className="badge bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">Applications Open</span>
      </div>

      <form onSubmit={submit} className="card space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="label">Full name</span>
            <input className="input" placeholder="Jane Doe" value={form.full_name} onChange={(e) => updateField('full_name', e.target.value)} />
          </label>
          <label>
            <span className="label">Matric number</span>
            <input className="input" placeholder="WUCC/2026/001" value={form.matric} onChange={(e) => updateField('matric', e.target.value)} />
          </label>
          <label>
            <span className="label">Department</span>
            <select className="input" value={form.department} onChange={(e) => updateField('department', e.target.value)}>
              <option value="">Select department</option>
              {departmentOptions.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
          </label>
          <label>
            <span className="label">Level</span>
            <select className="input" value={form.level} onChange={(e) => updateField('level', e.target.value)}>
              <option value="">Select level</option>
              {levelOptions.map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
          </label>
          <label>
            <span className="label">Email</span>
            <input className="input" type="email" placeholder="name@example.com" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
          </label>
          <label>
            <span className="label">Phone</span>
            <input className="input" placeholder="Optional" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
          </label>
          <label>
            <span className="label">Position</span>
            <PositionDropdown
              value={form.position_id}
              options={positionOptions}
              loading={positionsLoading}
              getLabel={displayPositionTitle}
              onChange={(id) => updateField('position_id', id)}
            />
          </label>
          <label>
            <span className="label">CGPA</span>
            <input className="input" type="number" min="3.0" max="5.0" step="0.01" placeholder="3.00 - 5.00" value={form.cgpa} onChange={(e) => updateField('cgpa', e.target.value)} />
          </label>
        </div>

        {positionsWarning && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertCircle className="mt-0.5 shrink-0" size={16} />
            <span>{positionsWarning}</span>
          </div>
        )}

        <div className="grid gap-3">
          <label>
            <span className="label">Manifesto</span>
            <textarea className="input min-h-28" placeholder="State your agenda clearly" value={form.manifesto} onChange={(e) => updateField('manifesto', e.target.value)} />
          </label>
          <label>
            <span className="label">Promises</span>
            <textarea className="input min-h-20" placeholder="One promise per line" value={form.promises} onChange={(e) => updateField('promises', e.target.value)} />
          </label>
        </div>

        <label className="flex cursor-pointer items-center gap-4 rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-3 transition hover:border-brand-400 hover:bg-brand-50/50 dark:border-slate-700 dark:bg-slate-950/50 dark:hover:bg-slate-900">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-md bg-white text-brand-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            {preview ? <img src={preview} alt="Candidate preview" className="h-full w-full object-cover" /> : <ImagePlus size={26} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 font-bold"><UploadCloud size={18} />Upload candidate photo</div>
            <div className="text-sm text-slate-500">JPG, PNG or WEBP under 2MB</div>
            {preview && <div className="mt-1 text-xs font-semibold text-brand-600 dark:text-brand-300">Preview ready</div>}
          </div>
          <input type="file" className="hidden" accept="image/png,image/jpeg,image/webp" onChange={handlePhoto} />
        </label>
        <StatusMessage>{error}</StatusMessage>
        <StatusMessage type="success">{success}</StatusMessage>
        <button className="btn-primary w-full sm:w-auto" disabled={submitting || positionsLoading}>
          {submitting ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
          {submitting ? 'Submitting application' : 'Submit application'}
        </button>
      </form>
    </section>
  );
}
