drop function if exists public.update_current_election_settings(text,text,timestamptz,timestamptz);
create or replace function public.update_current_election_settings(
  p_title text,
  p_status text,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
)
returns table (success boolean, message text, status text, ledger_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_status public.election_status;
  v_ledger_status text;
begin
  if public.current_user_role() not in ('superadmin', 'commissioner') then
    raise exception 'Only superadmins and admins can update election settings.';
  end if;
  if coalesce(nullif(p_status, ''), 'inactive') not in ('inactive', 'standby', 'active', 'ended', 'finalized') then
    raise exception 'Invalid election status. Use inactive, standby, active, ended, or finalized.';
  end if;

  v_status := coalesce(nullif(p_status, ''), 'inactive')::public.election_status;
  v_ledger_status := case
    when v_status = 'finalized' then 'finalized'
    when v_status = 'ended' then 'ready_to_finalize'
    when v_status = 'inactive' then 'locked'
    else 'open'
  end;

  select id into v_id from public.elections order by created_at desc limit 1;
  if v_id is null then
    insert into public.elections (title, status, ledger_status, starts_at, ends_at)
    values (coalesce(nullif(trim(p_title), ''), 'WUCC'), v_status, v_ledger_status, p_starts_at, p_ends_at)
    returning id into v_id;
  else
    update public.elections
    set title = coalesce(nullif(trim(p_title), ''), title),
        status = v_status,
        ledger_status = v_ledger_status,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        updated_at = now()
    where id = v_id;
  end if;

  perform public.write_audit_log(
    'election_' || v_status::text,
    'elections',
    v_id,
    jsonb_build_object('status', v_status::text, 'ledger_status', v_ledger_status)
  );

  return query
  select true, 'Election settings updated.', e.status::text, e.ledger_status
  from public.elections e
  where e.id = v_id;
end $$;

create or replace function public.election_allows_pre_start_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select e.status in ('inactive', 'standby')
    from public.elections e
    order by e.created_at desc
    limit 1
  ), true)
$$;

create or replace function public.delete_voter(p_voter_id uuid)
returns table (success boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_election_status text;
begin
  if public.current_user_role() not in ('superadmin', 'commissioner') then
    raise exception 'Only superadmins and admins can remove voters.';
  end if;
  select e.status::text into v_election_status from public.elections e order by e.created_at desc limit 1;
  if coalesce(v_election_status, 'inactive') not in ('inactive', 'standby') then
    raise exception 'Voters can only be removed when election status is inactive or standby. Current status: %.', v_election_status;
  end if;
  if exists (select 1 from public.votes where voter_id = p_voter_id) then
    raise exception 'This voter already has ledger activity and cannot be removed.';
  end if;

  delete from public.voters where id = p_voter_id;
  if not found then
    raise exception 'Voter record was not found or cannot be removed.';
  end if;
  return query select true, 'Voter removed.';
end $$;

create or replace function public.delete_candidate(p_candidate_id uuid)
returns table (success boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_election_status text;
begin
  if public.current_user_role() not in ('superadmin', 'commissioner') then
    raise exception 'Only superadmins and admins can remove candidates.';
  end if;
  select e.status::text into v_election_status from public.elections e order by e.created_at desc limit 1;
  if coalesce(v_election_status, 'inactive') not in ('inactive', 'standby') then
    raise exception 'Candidates can only be removed when election status is inactive or standby. Current status: %.', v_election_status;
  end if;
  if exists (select 1 from public.votes where candidate_id = p_candidate_id) then
    raise exception 'This candidate already has ledger activity and cannot be removed.';
  end if;

  delete from public.candidates where id = p_candidate_id;
  if not found then
    raise exception 'Candidate record was not found or cannot be removed.';
  end if;
  return query select true, 'Candidate removed.';
end $$;

create or replace function public.delete_candidate_application(p_application_id uuid)
returns table (success boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_election_status text;
begin
  if public.current_user_role() not in ('superadmin', 'commissioner') then
    raise exception 'Only superadmins and admins can remove candidate applications.';
  end if;
  select e.status::text into v_election_status from public.elections e order by e.created_at desc limit 1;
  if coalesce(v_election_status, 'inactive') not in ('inactive', 'standby') then
    raise exception 'Candidate applications can only be removed when election status is inactive or standby. Current status: %.', v_election_status;
  end if;
  if exists (
    select 1
    from public.candidates c
    where c.application_id = p_application_id
      and exists (select 1 from public.votes v where v.candidate_id = c.id)
  ) then
    raise exception 'This candidate application already has ledger activity and cannot be removed.';
  end if;

  delete from public.candidate_applications where id = p_application_id;
  if not found then
    raise exception 'Candidate application was not found or cannot be removed.';
  end if;
  return query select true, 'Candidate application removed.';
end $$;

drop policy if exists "admins delete voters" on public.voters;
create policy "admins delete voters" on public.voters
for delete using (public.is_election_admin() and public.election_allows_pre_start_management());

drop policy if exists "admins delete applications" on public.candidate_applications;
create policy "admins delete applications" on public.candidate_applications
for delete using (public.is_election_admin() and public.election_allows_pre_start_management());

drop policy if exists "admins delete candidates" on public.candidates;
create policy "admins delete candidates" on public.candidates
for delete using (public.is_election_admin() and public.election_allows_pre_start_management());

grant execute on function public.update_current_election_settings(text,text,timestamptz,timestamptz) to authenticated;
grant execute on function public.election_allows_pre_start_management() to authenticated;
grant execute on function public.delete_voter(uuid) to authenticated;
grant execute on function public.delete_candidate(uuid) to authenticated;
grant execute on function public.delete_candidate_application(uuid) to authenticated;
