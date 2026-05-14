create table if not exists public.voter_password_reset_requests (
  id uuid primary key default public.pgcrypto_random_uuid(),
  voter_id uuid not null references public.voters(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_email text not null,
  requested_matric text not null,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists voter_password_reset_one_pending
on public.voter_password_reset_requests(voter_id)
where status = 'pending';

create index if not exists idx_voter_password_reset_status
on public.voter_password_reset_requests(status, created_at desc);

drop trigger if exists voter_password_reset_touch_updated_at on public.voter_password_reset_requests;
create trigger voter_password_reset_touch_updated_at
before update on public.voter_password_reset_requests
for each row execute function public.touch_updated_at();

create or replace function public.request_voter_password_reset(p_email text, p_matric text)
returns table (submitted boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voter public.voters%rowtype;
  v_request_id uuid;
  v_message text := 'If your record matches, a reset request will be sent for review.';
begin
  select * into v_voter
  from public.voters v
  where lower(v.email) = lower(trim(p_email))
    and upper(v.matric) = upper(trim(p_matric))
    and v.status = 'approved'
  limit 1;

  if v_voter.id is not null then
    insert into public.voter_password_reset_requests(voter_id, requested_email, requested_matric)
    values (v_voter.id, lower(trim(p_email)), upper(trim(p_matric)))
    on conflict (voter_id) where status = 'pending'
    do update set
      requested_email = excluded.requested_email,
      requested_matric = excluded.requested_matric,
      requested_at = now(),
      updated_at = now()
    returning id into v_request_id;

    perform public.write_audit_log(
      'voter_password_reset_requested',
      'voter_password_reset_requests',
      v_request_id,
      jsonb_build_object('voter_id', v_voter.id)
    );
  end if;

  return query select true, v_message;
end $$;

create or replace function public.approve_voter_password_reset(p_request_id uuid)
returns table (
  id uuid,
  voter_id uuid,
  status text,
  password_is_default boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.voter_password_reset_requests%rowtype;
  v_voter public.voters%rowtype;
begin
  if public.current_user_role() not in ('superadmin', 'commissioner') then
    raise exception 'Only election admins can approve password reset requests.';
  end if;

  select * into v_request
  from public.voter_password_reset_requests r
  where r.id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Password reset request was not found.';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Password reset request is not pending.';
  end if;

  select * into v_voter
  from public.voters v
  where v.id = v_request.voter_id
  for update;

  if v_voter.id is null or v_voter.status <> 'approved' then
    raise exception 'Approved voter record was not found.';
  end if;

  update public.voters v
  set password_hash = public.pgcrypto_crypt(upper(v_voter.matric), public.pgcrypto_gen_salt('md5')),
      password_changed_at = null,
      updated_at = now()
  where v.id = v_voter.id;

  update public.voter_password_reset_requests r
  set status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where r.id = v_request.id
  returning * into v_request;

  perform public.write_audit_log(
    'voter_password_reset_approved',
    'voter_password_reset_requests',
    v_request.id,
    jsonb_build_object('voter_id', v_voter.id, 'reviewed_by', auth.uid())
  );

  return query select v_request.id, v_request.voter_id, v_request.status, true;
end $$;

alter table public.voter_password_reset_requests enable row level security;

drop policy if exists "admins manage voter password reset requests" on public.voter_password_reset_requests;
create policy "admins manage voter password reset requests" on public.voter_password_reset_requests
for all using (public.is_election_admin())
with check (public.is_election_admin());

grant select, update on public.voter_password_reset_requests to authenticated;
grant execute on function public.request_voter_password_reset(text,text) to anon, authenticated;
grant execute on function public.approve_voter_password_reset(uuid) to authenticated;
