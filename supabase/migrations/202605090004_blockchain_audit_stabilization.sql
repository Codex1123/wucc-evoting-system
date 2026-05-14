create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_role text not null default 'system',
  action text not null,
  record_table text,
  record_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_action on public.audit_logs(action);

create or replace function public.write_audit_log(
  p_action text,
  p_record_table text default null,
  p_record_id uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs(actor_id, actor_role, action, record_table, record_id, details)
  values (auth.uid(), coalesce(public.current_user_role(), 'system'), p_action, p_record_table, p_record_id, coalesce(p_details, '{}'::jsonb));
end $$;

create or replace function public.audit_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    perform public.write_audit_log(
      tg_table_name || '_status_' || new.status::text,
      tg_table_name,
      new.id,
      jsonb_build_object('from', old.status::text, 'to', new.status::text)
    );
  elsif tg_op = 'DELETE' then
    perform public.write_audit_log(
      tg_table_name || '_removed',
      tg_table_name,
      old.id,
      to_jsonb(old) - 'password_hash'
    );
  end if;
  return coalesce(new, old);
end $$;

create or replace function public.audit_vote_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.write_audit_log(
    'vote_confirmed',
    'blocks',
    new.id,
    jsonb_build_object(
      'block_number', new.block_number,
      'receipt_hash', new.receipt_hash,
      'block_hash', new.block_hash,
      'confirmation_count', new.confirmation_count,
      'validation_status', new.validation_status
    )
  );
  return new;
end $$;

drop trigger if exists audit_voter_status_change on public.voters;
create trigger audit_voter_status_change after update or delete on public.voters for each row execute function public.audit_status_change();

drop trigger if exists audit_candidate_status_change on public.candidates;
create trigger audit_candidate_status_change after update or delete on public.candidates for each row execute function public.audit_status_change();

drop trigger if exists audit_application_status_change on public.candidate_applications;
create trigger audit_application_status_change after update or delete on public.candidate_applications for each row execute function public.audit_status_change();

drop trigger if exists audit_block_confirmation on public.blocks;
create trigger audit_block_confirmation after insert on public.blocks for each row execute function public.audit_vote_confirmation();

create or replace function public.verify_vote_receipt(p_receipt_hash text)
returns table (
  exists_on_chain boolean,
  receipt_hash text,
  block_hash text,
  block_number bigint,
  validation_status text,
  anonymous_verification_id text,
  confirmation_count int,
  validator_votes jsonb,
  created_at timestamptz,
  election_title text,
  ledger_status text,
  election_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    true as exists_on_chain,
    b.receipt_hash,
    b.block_hash,
    b.block_number,
    b.validation_status,
    b.anonymous_verification_id,
    b.confirmation_count,
    b.validator_votes,
    b.created_at,
    e.title as election_title,
    e.ledger_status,
    e.status::text as election_status
  from public.ballots b
  join public.elections e on e.id = b.election_id
  where lower(coalesce(b.receipt_hash, '')) = lower(trim(coalesce(p_receipt_hash, '')))
     or lower(coalesce(b.block_hash, '')) = lower(trim(coalesce(p_receipt_hash, '')))
     or lower(coalesce(b.tx_hash, '')) = lower(trim(coalesce(p_receipt_hash, '')))
     or lower(coalesce(b.anonymous_verification_id, '')) = lower(trim(coalesce(p_receipt_hash, '')))
  limit 1
$$;

create or replace view public.blockchain_ledger as
select
  b.id,
  b.election_id,
  e.title as election_title,
  e.status::text as election_status,
  e.ledger_status,
  b.block_number,
  b.tx_hash,
  b.receipt_hash,
  b.block_hash,
  b.previous_hash,
  b.validator_status,
  b.validation_status,
  b.validator_votes,
  b.confirmation_count,
  b.anonymous_verification_id,
  b.created_at
from public.blocks b
join public.elections e on e.id = b.election_id;

alter table public.audit_logs enable row level security;

drop policy if exists "admins observers read audit logs" on public.audit_logs;
create policy "admins observers read audit logs" on public.audit_logs
for select using (public.is_admin_or_observer());

grant select on public.audit_logs to authenticated;
grant execute on function public.write_audit_log(text,text,uuid,jsonb) to authenticated;
grant execute on function public.verify_vote_receipt(text) to anon, authenticated;
grant select on public.blockchain_ledger to anon, authenticated;
