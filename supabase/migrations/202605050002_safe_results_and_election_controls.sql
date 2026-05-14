create or replace function public.get_candidate_results_safe()
returns table (
  candidate_id uuid,
  position_id uuid,
  vote_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id as candidate_id,
    c.position_id,
    count(vs.id)::int as vote_count
  from public.candidates c
  left join public.vote_selections vs on vs.candidate_id = c.id
  where c.status = 'approved'
  group by c.id, c.position_id
$$;

create or replace function public.get_election_stats_safe()
returns table (
  registered_voters int,
  approved_voters int,
  pending_voters int,
  voted_voters int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::int as registered_voters,
    count(*) filter (where status = 'approved')::int as approved_voters,
    count(*) filter (where status = 'pending')::int as pending_voters,
    count(*) filter (where has_voted)::int as voted_voters
  from public.voters
$$;

create or replace function public.update_current_election_settings(
  p_title text,
  p_status public.election_status default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_election_admin() then
    raise exception 'Only superadmins and commissioners can update election settings.';
  end if;

  if nullif(trim(p_title), '') is null then
    raise exception 'Election title is required.';
  end if;

  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'Election end date must be after start date.';
  end if;

  update public.elections
  set title = trim(p_title),
      status = coalesce(p_status, status),
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      updated_at = now()
  where id = (select id from public.elections order by created_at desc limit 1);
end;
$$;

create or replace function public.reset_current_election_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_election_id uuid;
begin
  if not public.is_election_admin() then
    raise exception 'Only superadmins and commissioners can reset election data.';
  end if;

  select id into v_election_id
  from public.elections
  order by created_at desc
  limit 1;

  if v_election_id is null then
    raise exception 'No election record found.';
  end if;

  delete from public.ballots where election_id = v_election_id;
  update public.voters set has_voted = false;
  update public.elections
  set status = 'inactive',
      starts_at = null,
      ends_at = null,
      updated_at = now()
  where id = v_election_id;
end;
$$;

grant execute on function public.get_candidate_results_safe() to anon, authenticated;
grant execute on function public.get_election_stats_safe() to anon, authenticated;
grant execute on function public.update_current_election_settings(text,public.election_status,timestamptz,timestamptz) to authenticated;
grant execute on function public.reset_current_election_data() to authenticated;
