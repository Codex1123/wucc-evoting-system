create extension if not exists pgcrypto;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.pgcrypto_digest(p_data text, p_type text)
returns bytea
language plpgsql
immutable
set search_path = public
as $$
declare
  v_digest bytea;
begin
  begin
    execute 'select extensions.digest($1, $2)' into v_digest using p_data, p_type;
    return v_digest;
  exception when undefined_function or invalid_schema_name then
    begin
      execute 'select public.digest($1, $2)' into v_digest using p_data, p_type;
      return v_digest;
    exception when undefined_function or invalid_schema_name then
      return decode(md5(p_data) || md5(p_data || ':' || p_type), 'hex');
    end;
  end;
end $$;

create or replace function public.pgcrypto_random_bytes(p_length int)
returns bytea
language plpgsql
volatile
set search_path = public
as $$
declare
  v_bytes bytea;
  v_hex text := '';
begin
  begin
    execute 'select extensions.gen_random_bytes($1)' into v_bytes using p_length;
    return v_bytes;
  exception when undefined_function or invalid_schema_name then
    begin
      execute 'select public.gen_random_bytes($1)' into v_bytes using p_length;
      return v_bytes;
    exception when undefined_function or invalid_schema_name then
      while length(v_hex) < p_length * 2 loop
        v_hex := v_hex || md5(clock_timestamp()::text || random()::text || v_hex);
      end loop;
      return decode(substr(v_hex, 1, p_length * 2), 'hex');
    end;
  end;
end $$;

alter table public.voters
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists voters_auth_user_id_unique
  on public.voters(auth_user_id)
  where auth_user_id is not null;

create unique index if not exists voters_matric_unique_lower
  on public.voters(lower(matric));

create unique index if not exists voters_email_unique_lower
  on public.voters(lower(email));

drop view if exists public.candidate_results;
create view public.candidate_results
with (security_invoker = true) as
select
  c.id as candidate_id,
  c.position_id,
  count(vs.id)::int as vote_count
from public.candidates c
left join public.vote_selections vs on vs.candidate_id = c.id
where c.status = 'approved'
group by c.id, c.position_id;

drop view if exists public.election_stats;
create view public.election_stats
with (security_invoker = true) as
select
  count(*)::int as registered_voters,
  count(*) filter (where status = 'approved')::int as approved_voters,
  count(*) filter (where status = 'pending')::int as pending_voters,
  count(*) filter (where has_voted)::int as voted_voters
from public.voters;

create or replace function public.cast_ballot(
  p_matric text,
  p_department text,
  p_email text,
  p_selections jsonb
)
returns table (
  tx_hash text,
  voter_hash text,
  block_number bigint,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_election public.elections%rowtype;
  v_voter public.voters%rowtype;
  v_ballot_id uuid;
  v_tx_hash text := '0x' || encode(public.pgcrypto_random_bytes(32), 'hex');
  v_voter_hash text := '0x' || encode(public.pgcrypto_digest(lower(trim(p_matric)) || ':' || now()::text, 'sha256'), 'hex');
  v_block bigint;
  item jsonb;
  v_position_id uuid;
  v_candidate_id uuid;
begin
  select * into v_election
  from public.elections
  where status = 'active'
  order by created_at desc
  limit 1;

  if v_election.id is null then
    raise exception 'Election is not active.';
  end if;

  select * into v_voter
  from public.voters v
  where lower(v.matric) = lower(trim(p_matric))
    and v.department = p_department
    and lower(v.email) = lower(trim(p_email))
  for update;

  if v_voter.id is null then
    raise exception 'Voter not found.';
  end if;
  if v_voter.status <> 'approved' then
    raise exception 'Voter is not approved.';
  end if;
  if v_voter.has_voted then
    raise exception 'Voter has already voted.';
  end if;
  if jsonb_typeof(p_selections) <> 'array' or jsonb_array_length(p_selections) = 0 then
    raise exception 'Select at least one candidate.';
  end if;

  select coalesce(max(b.block_number), 1200) + 1 into v_block from public.ballots b;

  insert into public.ballots(election_id, voter_id, tx_hash, voter_hash, block_number)
  values (v_election.id, v_voter.id, v_tx_hash, left(v_voter_hash, 18), v_block)
  returning id into v_ballot_id;

  for item in select * from jsonb_array_elements(p_selections)
  loop
    v_position_id := nullif(item->>'position_id', '')::uuid;
    v_candidate_id := nullif(item->>'candidate_id', '')::uuid;
    if v_position_id is null or v_candidate_id is null then
      raise exception 'Every vote selection must include a valid position and candidate.';
    end if;
    if not exists (
      select 1
      from public.candidates c
      join public.positions p on p.id = c.position_id
      where c.id = v_candidate_id
        and p.id = v_position_id
        and p.election_id = v_election.id
        and c.status = 'approved'
        and p.is_active = true
    ) then
      raise exception 'Invalid candidate selection.';
    end if;
    insert into public.vote_selections(ballot_id, position_id, candidate_id)
    values (v_ballot_id, v_position_id, v_candidate_id);
  end loop;

  update public.voters set has_voted = true where id = v_voter.id;

  return query
  select b.tx_hash, b.voter_hash, b.block_number, b.created_at
  from public.ballots b
  where b.id = v_ballot_id;
end;
$$;

grant select on public.candidate_results, public.election_stats to anon, authenticated;
grant execute on function public.cast_ballot(text,text,text,jsonb) to anon, authenticated;
