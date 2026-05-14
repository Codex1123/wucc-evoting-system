alter table public.voters
  add column if not exists rejection_reason text;

alter table public.candidate_applications
  add column if not exists rejection_reason text;

alter table public.candidates
  add column if not exists rejection_reason text;
