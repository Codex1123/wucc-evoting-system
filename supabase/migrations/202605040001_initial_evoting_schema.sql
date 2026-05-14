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

create type public.user_role as enum ('superadmin','commissioner','observer','voter');
create type public.record_status as enum ('pending','approved','rejected');
create type public.election_status as enum ('inactive','standby','active','ended','finalized');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'voter',
  created_at timestamptz not null default now()
);

create table public.elections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status public.election_status not null default 'inactive',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  slug text not null,
  title text not null,
  icon text,
  display_order int not null default 0,
  is_active boolean not null default true,
  unique (election_id, slug)
);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.positions(id) on delete cascade,
  full_name text not null,
  matric text not null,
  department text,
  level text,
  manifesto text,
  promises text[] not null default '{}',
  avatar text,
  photo_url text,
  status public.record_status not null default 'approved',
  created_at timestamptz not null default now(),
  unique (position_id, matric)
);

create table public.voters (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  matric text not null unique,
  department text not null,
  level text,
  email text not null unique,
  status public.record_status not null default 'pending',
  has_voted boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.ballots (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete restrict,
  voter_id uuid not null references public.voters(id) on delete restrict,
  tx_hash text not null unique,
  voter_hash text not null,
  block_number bigint not null,
  created_at timestamptz not null default now(),
  unique (election_id, voter_id)
);

create table public.vote_selections (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid not null references public.ballots(id) on delete cascade,
  position_id uuid not null references public.positions(id) on delete restrict,
  candidate_id uuid not null references public.candidates(id) on delete restrict,
  unique (ballot_id, position_id)
);

create table public.candidate_applications (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  position_id uuid not null references public.positions(id) on delete restrict,
  full_name text not null,
  matric text not null,
  department text not null,
  level text,
  email text,
  phone text,
  manifesto text not null,
  promises text[] not null default '{}',
  cgpa text,
  previous_role text,
  photo_url text,
  status public.record_status not null default 'pending',
  reference text not null unique,
  created_at timestamptz not null default now()
);

create view public.candidate_results as
select
  c.id as candidate_id,
  c.position_id,
  count(vs.id)::int as vote_count
from public.candidates c
left join public.vote_selections vs on vs.candidate_id = c.id
where c.status = 'approved'
group by c.id, c.position_id;

create view public.election_stats as
select
  count(*)::int as registered_voters,
  count(*) filter (where status = 'approved')::int as approved_voters,
  count(*) filter (where status = 'pending')::int as pending_voters,
  count(*) filter (where has_voted)::int as voted_voters
from public.voters;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_election_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('superadmin','commissioner'), false)
$$;

create or replace function public.verify_voter(
  p_matric text,
  p_department text,
  p_email text
)
returns table (
  id uuid,
  full_name text,
  matric text,
  department text,
  level text,
  email text,
  status public.record_status,
  has_voted boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select v.id, v.full_name, v.matric, v.department, v.level, v.email, v.status, v.has_voted
  from public.voters v
  where lower(v.matric) = lower(trim(p_matric))
    and v.department = p_department
    and lower(v.email) = lower(trim(p_email))
  limit 1;
end;
$$;

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

  select coalesce(max(b.block_number), 1200) + 1 into v_block from public.ballots b;

  insert into public.ballots(election_id, voter_id, tx_hash, voter_hash, block_number)
  values (v_election.id, v_voter.id, v_tx_hash, left(v_voter_hash, 18), v_block)
  returning id into v_ballot_id;

  for item in select * from jsonb_array_elements(p_selections)
  loop
    insert into public.vote_selections(ballot_id, position_id, candidate_id)
    values ((v_ballot_id), (item->>'position_id')::uuid, (item->>'candidate_id')::uuid);
  end loop;

  update public.voters set has_voted = true where id = v_voter.id;

  return query
  select b.tx_hash, b.voter_hash, b.block_number, b.created_at
  from public.ballots b
  where b.id = v_ballot_id;
end;
$$;

create or replace function public.set_current_election_status(
  p_status public.election_status,
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
    raise exception 'Only superadmins and commissioners can control elections.';
  end if;

  update public.elections
  set status = p_status,
      starts_at = coalesce(p_starts_at, starts_at, now()),
      ends_at = coalesce(p_ends_at, ends_at),
      updated_at = now()
  where id = (select id from public.elections order by created_at desc limit 1);
end;
$$;

create or replace function public.promote_approved_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    insert into public.candidates (
      position_id, full_name, matric, department, level, manifesto, promises, photo_url, status
    )
    values (
      new.position_id, new.full_name, new.matric, new.department, new.level,
      new.manifesto, new.promises, new.photo_url, 'approved'
    )
    on conflict (position_id, matric) do nothing;
  end if;
  return new;
end;
$$;

create trigger candidate_application_approved
after update of status on public.candidate_applications
for each row
execute function public.promote_approved_application();

alter table public.profiles enable row level security;
alter table public.elections enable row level security;
alter table public.positions enable row level security;
alter table public.candidates enable row level security;
alter table public.voters enable row level security;
alter table public.ballots enable row level security;
alter table public.vote_selections enable row level security;
alter table public.candidate_applications enable row level security;

create policy "profiles can read own profile" on public.profiles for select using (id = auth.uid());
create policy "superadmins manage profiles" on public.profiles for all using (public.current_user_role() = 'superadmin') with check (public.current_user_role() = 'superadmin');

create policy "public reads elections" on public.elections for select using (true);
create policy "admins manage elections" on public.elections for all using (public.is_election_admin()) with check (public.is_election_admin());

create policy "public reads positions" on public.positions for select using (is_active = true);
create policy "admins manage positions" on public.positions for all using (public.is_election_admin()) with check (public.is_election_admin());

create policy "public reads approved candidates" on public.candidates for select using (status = 'approved');
create policy "admins manage candidates" on public.candidates for all using (public.is_election_admin()) with check (public.is_election_admin());

create policy "admins read voters" on public.voters for select using (public.is_election_admin() or public.current_user_role() = 'observer');
create policy "admins insert voters" on public.voters for insert with check (public.is_election_admin());
create policy "admins update voters" on public.voters for update using (public.is_election_admin()) with check (public.is_election_admin());

create policy "public reads ballot receipts" on public.ballots for select using (true);
create policy "public reads aggregate selections" on public.vote_selections for select using (true);

create policy "public submits applications" on public.candidate_applications for insert with check (true);
create policy "admins read applications" on public.candidate_applications for select using (public.is_election_admin() or public.current_user_role() = 'observer');
create policy "admins update applications" on public.candidate_applications for update using (public.is_election_admin()) with check (public.is_election_admin());

grant usage on schema public to anon, authenticated;
grant select on public.elections, public.positions, public.candidates, public.ballots, public.vote_selections, public.candidate_results, public.election_stats to anon, authenticated;
grant insert on public.candidate_applications to anon, authenticated;
grant select, insert, update on public.voters, public.candidate_applications, public.positions, public.candidates, public.elections to authenticated;
grant select on public.profiles to authenticated;
grant execute on function public.verify_voter(text,text,text) to anon, authenticated;
grant execute on function public.cast_ballot(text,text,text,jsonb) to anon, authenticated;
grant execute on function public.set_current_election_status(public.election_status,timestamptz,timestamptz) to authenticated;
