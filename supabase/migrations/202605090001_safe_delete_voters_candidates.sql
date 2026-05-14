create or replace function public.normalize_user_role(p_role text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(replace(replace(trim(coalesce(p_role, '')), '-', '_'), ' ', '_'))
    when 'super_admin' then 'superadmin'
    when 'superadmins' then 'superadmin'
    when 'superadmn' then 'superadmin'
    when 'admin' then 'commissioner'
    when 'commission' then 'commissioner'
    when 'commissoner' then 'commissioner'
    when 'comissioner' then 'commissioner'
    when 'commisioner' then 'commissioner'
    when 'commissioner' then 'commissioner'
    when 'observer' then 'observer'
    when 'voter' then 'voter'
    else lower(replace(replace(trim(coalesce(p_role, 'voter')), '-', '_'), ' ', '_'))
  end
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
  select e.status::text into v_election_status
  from public.elections e
  order by e.created_at desc
  limit 1;
  if coalesce(v_election_status, 'inactive') not in ('inactive', 'standby') then
    raise exception 'Voters can only be removed when election status is inactive or standby. Current status: %.', v_election_status;
  end if;
  if exists (select 1 from public.votes where voter_id = p_voter_id) then
    raise exception 'This voter already has ledger activity and cannot be removed.';
  end if;

  delete from public.voters
  where id = p_voter_id;

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
  select e.status::text into v_election_status
  from public.elections e
  order by e.created_at desc
  limit 1;
  if coalesce(v_election_status, 'inactive') not in ('inactive', 'standby') then
    raise exception 'Candidates can only be removed when election status is inactive or standby. Current status: %.', v_election_status;
  end if;
  if exists (select 1 from public.votes where candidate_id = p_candidate_id) then
    raise exception 'This candidate already has ledger activity and cannot be removed.';
  end if;

  delete from public.candidates
  where id = p_candidate_id;

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
  select e.status::text into v_election_status
  from public.elections e
  order by e.created_at desc
  limit 1;
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

  delete from public.candidate_applications
  where id = p_application_id;

  if not found then
    raise exception 'Candidate application was not found or cannot be removed.';
  end if;

  return query select true, 'Candidate application removed.';
end $$;

create or replace function public.delete_voter_record(p_voter_id uuid)
returns table (success boolean, message text)
language sql
security definer
set search_path = public
as $$
  select * from public.delete_voter(p_voter_id);
$$;

create or replace function public.delete_candidate_record(p_candidate_id uuid)
returns table (success boolean, message text)
language sql
security definer
set search_path = public
as $$
  select * from public.delete_candidate(p_candidate_id);
$$;

create or replace function public.delete_candidate_application_record(p_application_id uuid)
returns table (success boolean, message text)
language sql
security definer
set search_path = public
as $$
  select * from public.delete_candidate_application(p_application_id);
$$;

drop policy if exists "admins delete voters" on public.voters;
create policy "admins delete voters" on public.voters
for delete using (public.is_election_admin() and public.election_allows_pre_start_management());

drop policy if exists "admins delete applications" on public.candidate_applications;
create policy "admins delete applications" on public.candidate_applications
for delete using (public.is_election_admin() and public.election_allows_pre_start_management());

drop policy if exists "admins delete candidates" on public.candidates;
create policy "admins delete candidates" on public.candidates
for delete using (public.is_election_admin() and public.election_allows_pre_start_management());

grant delete on public.voters, public.candidate_applications, public.candidates to authenticated;
grant execute on function public.delete_voter(uuid) to authenticated;
grant execute on function public.delete_candidate(uuid) to authenticated;
grant execute on function public.delete_candidate_application(uuid) to authenticated;
grant execute on function public.delete_voter_record(uuid) to authenticated;
grant execute on function public.delete_candidate_record(uuid) to authenticated;
grant execute on function public.delete_candidate_application_record(uuid) to authenticated;
