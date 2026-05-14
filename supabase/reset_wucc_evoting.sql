-- ================================================================
-- WUCC eVoting Supabase Reset
-- Fresh Supabase project compatible. This deletes existing WUCC data.
--
-- Correct setup order:
--   1. Run this file: supabase/reset_wucc_evoting.sql
--   2. Run supabase/seed.sql
--   3. Create Supabase Auth users for admins/voters as needed
--   4. Insert matching public.profiles rows for admin users:
--        id = auth.users.id
--        role in ('superadmin', 'commissioner', 'observer', 'voter')
--
-- Voter registrations are stored in public.voters as pending until an
-- admin approves them. Approved voters login with email + password; the
-- initial default password is the voter's matric number.
-- Candidate applications are stored as pending until approved. Approval
-- promotes the application into public.candidates.
-- ================================================================

begin;

create extension if not exists pgcrypto;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Supabase installs database extensions in the `extensions` schema on
-- hosted projects. All pgcrypto calls below are schema-qualified so
-- SECURITY DEFINER functions with `search_path = public` can still find
-- them reliably.
--
-- Voter passwords are for this academic/demo voter login layer only;
-- admin login remains Supabase Auth email/password. We use pgcrypto
-- `crypt()` with `gen_salt('md5')` because it is consistently available
-- in Supabase PostgreSQL, while bcrypt salt support (`gen_salt('bf')`)
-- can be unavailable in some hosted extension builds.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'normalize_user_role',
        'current_user_role',
        'is_election_admin',
        'is_admin_or_observer',
        'register_voter',
        'check_voter_duplicate',
        'check_candidate_application_duplicate',
        'ensure_voter_profile',
        'ensure_voter_default_password',
        'get_voter_login_by_email',
        'get_voter_login_by_matric',
        'verify_voter_password',
        'change_voter_password',
        'write_audit_log',
        'audit_status_change',
        'audit_vote_confirmation',
        'prevent_finalized_ledger_changes',
        'verify_voter',
        'cast_ballot',
        'verify_vote_receipt',
        'update_current_election_settings',
        'reset_current_election_data',
        'election_allows_pre_start_management',
        'set_voter_status',
        'delete_voter',
        'set_candidate_application_status',
        'set_candidate_status',
        'delete_candidate',
        'delete_candidate_application',
        'delete_voter_record',
        'delete_candidate_record',
        'delete_candidate_application_record',
        'get_candidate_results_safe',
        'get_election_stats_safe',
        'get_public_receipts_safe',
        'promote_approved_application',
        'touch_updated_at'
      )
  loop
    execute format('drop function if exists %s cascade', r.signature);
  end loop;
end $$;

do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name, c.relname as relation_name, c.relkind as relation_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'candidate_results',
        'election_stats',
        'blockchain_ledger',
        'vote_receipts',
        'admins',
        'vote_selections',
        'votes',
        'ballots',
        'blocks',
        'audit_logs',
        'candidates',
        'candidate_applications',
        'voters',
        'positions',
        'elections',
        'profiles'
      )
    order by array_position(
      array[
        'candidate_results',
        'election_stats',
        'blockchain_ledger',
        'vote_receipts',
        'admins',
        'vote_selections',
        'votes',
        'ballots',
        'blocks',
        'audit_logs',
        'candidates',
        'candidate_applications',
        'voters',
        'positions',
        'elections',
        'profiles'
      ],
      c.relname
    )
  loop
    if r.relation_kind in ('v', 'm') then
      execute format('drop view if exists %I.%I cascade', r.schema_name, r.relation_name);
    elsif r.relation_kind in ('r', 'p', 'f') then
      execute format('drop table if exists %I.%I cascade', r.schema_name, r.relation_name);
    end if;
end loop;
end $$;

create or replace function public.pgcrypto_gen_salt(p_algorithm text)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_salt text;
begin
  begin
    execute 'select extensions.gen_salt($1)' into v_salt using p_algorithm;
    return v_salt;
  exception when undefined_function or invalid_schema_name then
    begin
      execute 'select public.gen_salt($1)' into v_salt using p_algorithm;
      return v_salt;
    exception when undefined_function or invalid_schema_name then
      return 'plain$';
    end;
  end;
end $$;

create or replace function public.pgcrypto_crypt(p_password text, p_salt text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_hash text;
begin
  if p_salt like 'plain$%' then
    return 'plain$' || p_password;
  end if;

  begin
    execute 'select extensions.crypt($1, $2)' into v_hash using p_password, p_salt;
    return v_hash;
  exception when undefined_function or invalid_schema_name then
    begin
      execute 'select public.crypt($1, $2)' into v_hash using p_password, p_salt;
      return v_hash;
    exception when undefined_function or invalid_schema_name then
      return 'plain$' || p_password;
    end;
  end;
end $$;

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

create or replace function public.pgcrypto_random_uuid()
returns uuid
language plpgsql
volatile
set search_path = public
as $$
declare
  v_uuid uuid;
begin
  begin
    execute 'select pg_catalog.gen_random_uuid()' into v_uuid;
    return v_uuid;
  exception when undefined_function then
    begin
      execute 'select extensions.gen_random_uuid()' into v_uuid;
      return v_uuid;
    exception when undefined_function or invalid_schema_name then
      begin
        execute 'select public.gen_random_uuid()' into v_uuid;
        return v_uuid;
      exception when undefined_function or invalid_schema_name then
        return (
          substr(md5(clock_timestamp()::text || random()::text), 1, 8) || '-' ||
          substr(md5(random()::text), 1, 4) || '-4' ||
          substr(md5(random()::text), 1, 3) || '-8' ||
          substr(md5(random()::text), 1, 3) || '-' ||
          substr(md5(clock_timestamp()::text || random()::text), 1, 12)
        )::uuid;
      end;
    end;
  end;
end $$;

drop type if exists public.user_role cascade;
drop type if exists public.record_status cascade;
drop type if exists public.election_status cascade;

create type public.user_role as enum ('superadmin', 'commissioner', 'observer', 'voter');
create type public.record_status as enum ('pending', 'approved', 'rejected');
create type public.election_status as enum ('inactive', 'standby', 'active', 'ended', 'finalized');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'voter',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.elections (
  id uuid primary key default public.pgcrypto_random_uuid(),
  title text not null default 'WUCC',
  academic_year text,
  status public.election_status not null default 'inactive',
  ledger_status text not null default 'open' check (ledger_status in ('open', 'ready_to_finalize', 'finalized', 'locked')),
  candidate_applications_open boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  finalized_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.positions (
  id uuid primary key default public.pgcrypto_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  slug text not null,
  title text not null,
  icon text,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (election_id, slug),
  unique (id, election_id)
);

create table public.voters (
  id uuid primary key default public.pgcrypto_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  matric text not null unique,
  department text not null,
  level text,
  email text not null unique,
  password_hash text,
  password_changed_at timestamptz,
  status public.record_status not null default 'pending',
  rejection_reason text,
  has_voted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.candidate_applications (
  id uuid primary key default public.pgcrypto_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  position_id uuid not null,
  full_name text not null,
  matric text not null,
  department text not null,
  level text not null,
  email text,
  phone text,
  manifesto text not null,
  promises text[] not null default '{}',
  cgpa numeric(3,2) not null check (cgpa >= 3.00 and cgpa <= 5.00),
  previous_role text,
  photo_url text,
  status public.record_status not null default 'pending',
  rejection_reason text,
  reference text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (position_id, election_id) references public.positions(id, election_id) on delete restrict,
  unique (election_id, position_id, matric)
);

create table public.candidates (
  id uuid primary key default public.pgcrypto_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  position_id uuid not null,
  application_id uuid references public.candidate_applications(id) on delete set null,
  full_name text not null,
  matric text not null,
  email text,
  department text,
  level text,
  manifesto text,
  promises text[] not null default '{}',
  cgpa numeric(3,2),
  avatar text,
  photo_url text,
  status public.record_status not null default 'approved',
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (position_id, election_id) references public.positions(id, election_id) on delete cascade,
  unique (election_id, position_id, matric)
);

create table public.blocks (
  id uuid primary key default public.pgcrypto_random_uuid(),
  election_id uuid not null references public.elections(id) on delete restrict,
  voter_id uuid not null references public.voters(id) on delete restrict,
  block_number bigint not null,
  tx_hash text not null unique,
  vote_hash text not null unique,
  receipt_hash text not null unique,
  block_hash text not null unique,
  voter_hash text not null,
  previous_hash text,
  validator_status text not null default 'pbft_confirmed',
  validation_status text not null default 'pbft_confirmed',
  consensus_status text not null default 'confirmed' check (consensus_status in ('pending', 'confirmed', 'rejected')),
  validator_votes jsonb not null default '{"validator_1":true,"validator_2":true,"validator_3":true,"validator_4":false,"validator_5":true}'::jsonb,
  validator_confirmations int not null default 4 check (validator_confirmations >= 0 and validator_confirmations <= 5),
  confirmation_count int not null default 4 check (confirmation_count >= 0 and confirmation_count <= 5),
  anonymous_verification_id text not null default ('WUCC-' || encode(public.pgcrypto_random_bytes(8), 'hex')),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  check (validator_status = 'pbft_confirmed'),
  check (validation_status = 'pbft_confirmed'),
  unique (election_id, voter_id),
  unique (election_id, block_number)
);

create table public.ballots (
  id uuid primary key default public.pgcrypto_random_uuid(),
  election_id uuid not null references public.elections(id) on delete restrict,
  voter_id uuid not null references public.voters(id) on delete restrict,
  block_id uuid not null unique references public.blocks(id) on delete cascade,
  block_number bigint not null,
  tx_hash text not null unique,
  vote_hash text not null unique,
  receipt_hash text not null unique,
  block_hash text not null,
  previous_hash text,
  voter_hash text not null,
  validator_status text not null default 'pbft_confirmed',
  validation_status text not null default 'pbft_confirmed',
  consensus_status text not null default 'confirmed' check (consensus_status in ('pending', 'confirmed', 'rejected')),
  validator_votes jsonb not null default '{"validator_1":true,"validator_2":true,"validator_3":true,"validator_4":false,"validator_5":true}'::jsonb,
  validator_confirmations int not null default 4 check (validator_confirmations >= 0 and validator_confirmations <= 5),
  confirmation_count int not null default 4 check (confirmation_count >= 0 and confirmation_count <= 5),
  anonymous_verification_id text not null default ('WUCC-' || encode(public.pgcrypto_random_bytes(8), 'hex')),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  check (validator_status = 'pbft_confirmed'),
  check (validation_status = 'pbft_confirmed'),
  unique (election_id, voter_id),
  unique (election_id, block_number)
);

create table public.votes (
  id uuid primary key default public.pgcrypto_random_uuid(),
  election_id uuid not null references public.elections(id) on delete restrict,
  ballot_id uuid not null references public.ballots(id) on delete cascade,
  block_id uuid not null references public.blocks(id) on delete cascade,
  voter_id uuid not null references public.voters(id) on delete restrict,
  position_id uuid not null,
  candidate_id uuid not null references public.candidates(id) on delete restrict,
  vote_hash text not null,
  receipt_hash text not null,
  block_hash text not null,
  validation_status text not null default 'pbft_confirmed',
  consensus_status text not null default 'confirmed' check (consensus_status in ('pending', 'confirmed', 'rejected')),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  check (validation_status = 'pbft_confirmed'),
  foreign key (position_id, election_id) references public.positions(id, election_id) on delete restrict,
  unique (ballot_id, position_id),
  unique (election_id, voter_id, position_id)
);

create table public.audit_logs (
  id uuid primary key default public.pgcrypto_random_uuid(),
  actor_id uuid,
  actor_role text not null default 'system',
  action text not null,
  record_table text,
  record_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_positions_election_order on public.positions(election_id, display_order);
create index idx_positions_public_fetch on public.positions(is_active, display_order);
create index idx_candidates_position_status on public.candidates(position_id, status);
create index idx_candidates_election_status on public.candidates(election_id, status);
create index idx_applications_status_created on public.candidate_applications(status, created_at desc);
create index idx_voters_status on public.voters(status);
create unique index voters_matric_unique_lower on public.voters (lower(matric));
create unique index voters_email_unique_lower on public.voters (lower(email));
create unique index candidate_applications_unique_position_matric_lower on public.candidate_applications (election_id, position_id, lower(matric));
create unique index candidate_applications_unique_position_email_lower on public.candidate_applications (election_id, position_id, lower(email)) where email is not null;
create unique index candidates_approved_matric_unique_lower on public.candidates (election_id, lower(matric)) where status = 'approved'::public.record_status;
create unique index candidates_approved_email_unique_lower on public.candidates (election_id, lower(email)) where status = 'approved'::public.record_status and email is not null;
create index idx_votes_candidate on public.votes(candidate_id);
create index idx_votes_position on public.votes(position_id);
create index idx_blocks_created_at on public.blocks(created_at desc);
create index idx_ballots_created_at on public.ballots(created_at desc);
create index idx_ballots_receipt_hash on public.ballots(receipt_hash);
create index idx_blocks_vote_hash on public.blocks(vote_hash);
create index idx_ballots_vote_hash on public.ballots(vote_hash);
create unique index votes_vote_hash_unique on public.votes(vote_hash);
create index idx_votes_receipt_hash on public.votes(receipt_hash);
create index idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index idx_audit_logs_action on public.audit_logs(action);

create or replace view public.candidate_results as
select
  c.id as candidate_id,
  c.position_id,
  c.election_id,
  c.full_name,
  coalesce(count(v.id), 0)::int as vote_count
from public.candidates c
left join public.votes v on v.candidate_id = c.id
group by c.id;

create or replace view public.election_stats as
select
  e.id as election_id,
  count(distinct v.id)::int as registered_voters,
  count(distinct v.id) filter (where v.status = 'approved')::int as approved_voters,
  count(distinct v.id) filter (where v.status = 'pending')::int as pending_voters,
  count(distinct v.id) filter (where v.has_voted)::int as voted_voters,
  count(distinct b.id)::int as ballots_cast
from public.elections e
left join public.voters v on true
left join public.blocks b on b.election_id = e.id
group by e.id;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
create trigger elections_touch_updated_at before update on public.elections for each row execute function public.touch_updated_at();
create trigger positions_touch_updated_at before update on public.positions for each row execute function public.touch_updated_at();
create trigger voters_touch_updated_at before update on public.voters for each row execute function public.touch_updated_at();
create trigger applications_touch_updated_at before update on public.candidate_applications for each row execute function public.touch_updated_at();
create trigger candidates_touch_updated_at before update on public.candidates for each row execute function public.touch_updated_at();

create or replace function public.ensure_voter_default_password()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.password_hash is null then
    -- Default voter password is the matric number. Store only a pgcrypto
    -- crypt hash; `md5` salt is chosen for Supabase demo compatibility.
    new.password_hash := public.pgcrypto_crypt(upper(new.matric), public.pgcrypto_gen_salt('md5'));
    new.password_changed_at := null;
  end if;
  return new;
end $$;

create trigger voters_default_password before insert on public.voters for each row execute function public.ensure_voter_default_password();


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

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select public.normalize_user_role(p.role::text)
      from public.profiles p
      where p.id = auth.uid()
      limit 1
    ),
    'anon'
  )
$$;

create or replace function public.is_election_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('superadmin', 'commissioner')
$$;

create or replace function public.is_admin_or_observer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('superadmin', 'commissioner', 'observer')
$$;

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
    jsonb_build_object('block_number', new.block_number, 'receipt_hash', new.receipt_hash, 'confirmation_count', new.confirmation_count, 'validation_status', new.validation_status)
  );
  return new;
end $$;

create trigger audit_block_confirmation after insert on public.blocks for each row execute function public.audit_vote_confirmation();

create or replace function public.audit_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    perform public.write_audit_log(tg_table_name || '_status_' || new.status::text, tg_table_name, new.id, jsonb_build_object('from', old.status::text, 'to', new.status::text));
  elsif tg_op = 'DELETE' then
    perform public.write_audit_log(tg_table_name || '_removed', tg_table_name, old.id, to_jsonb(old) - 'password_hash');
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

create trigger audit_voter_status_change after update or delete on public.voters for each row execute function public.audit_status_change();
create trigger audit_candidate_status_change after update or delete on public.candidates for each row execute function public.audit_status_change();
create trigger audit_application_status_change after update or delete on public.candidate_applications for each row execute function public.audit_status_change();

create or replace function public.prevent_finalized_ledger_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_election_id uuid;
  v_is_finalized boolean;
begin
  if tg_op = 'DELETE' then
    v_election_id := old.election_id;
  else
    v_election_id := new.election_id;
  end if;

  select exists (
    select 1
    from public.elections e
    where e.id = v_election_id
      and (e.status = 'finalized' or e.ledger_status = 'finalized')
  ) into v_is_finalized;

  if v_is_finalized then
    raise exception 'Finalized election ledger is immutable.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

create trigger prevent_finalized_blocks_change before update or delete on public.blocks for each row execute function public.prevent_finalized_ledger_changes();
create trigger prevent_finalized_ballots_change before update or delete on public.ballots for each row execute function public.prevent_finalized_ledger_changes();
create trigger prevent_finalized_votes_change before update or delete on public.votes for each row execute function public.prevent_finalized_ledger_changes();

create or replace function public.check_voter_duplicate(
  p_matric text,
  p_email text,
  p_exclude_id uuid default null
)
returns table (matric_exists boolean, email_exists boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.voters v
      where upper(v.matric) = upper(trim(p_matric))
        and (p_exclude_id is null or v.id <> p_exclude_id)
    ) as matric_exists,
    exists (
      select 1
      from public.voters v
      where lower(v.email) = lower(trim(p_email))
        and (p_exclude_id is null or v.id <> p_exclude_id)
    ) as email_exists
$$;

create or replace function public.check_candidate_application_duplicate(
  p_election_id uuid,
  p_position_id uuid,
  p_matric text,
  p_email text default null
)
returns table (application_exists boolean, approved_candidate_exists boolean, email_exists boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.candidate_applications app
      where app.election_id = p_election_id
        and app.position_id = p_position_id
        and upper(app.matric) = upper(trim(p_matric))
    ) as application_exists,
    exists (
      select 1
      from public.candidates c
      where c.election_id = p_election_id
        and c.status = 'approved'
        and upper(c.matric) = upper(trim(p_matric))
    ) as approved_candidate_exists,
    exists (
      select 1
      from public.candidate_applications app
      where app.election_id = p_election_id
        and app.position_id = p_position_id
        and nullif(trim(coalesce(p_email, '')), '') is not null
        and lower(app.email) = lower(trim(p_email))
    ) or exists (
      select 1
      from public.candidates c
      where c.election_id = p_election_id
        and c.status = 'approved'
        and nullif(trim(coalesce(p_email, '')), '') is not null
        and lower(c.email) = lower(trim(p_email))
    ) as email_exists
$$;

create or replace function public.register_voter(
  p_full_name text,
  p_matric text,
  p_department text,
  p_level text,
  p_email text,
  p_auth_user_id uuid default null
)
returns table (
  id uuid,
  full_name text,
  matric text,
  department text,
  level text,
  email text,
  status text,
  has_voted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_matric text := upper(trim(p_matric));
  v_email text := lower(trim(p_email));
begin
  if nullif(trim(p_full_name), '') is null then raise exception 'Full name is required.'; end if;
  if nullif(trim(p_matric), '') is null then raise exception 'Matric number is required.'; end if;
  if nullif(trim(p_department), '') is null then raise exception 'Department is required.'; end if;
  if nullif(trim(p_level), '') is null then raise exception 'Level is required.'; end if;
  if nullif(trim(p_email), '') is null then raise exception 'Email is required.'; end if;

  if exists (select 1 from public.voters v where upper(v.matric) = v_matric) then
    raise exception 'A voter with this matric number already exists.';
  end if;

  if exists (select 1 from public.voters v where lower(v.email) = v_email) then
    raise exception 'This email is already registered.';
  end if;

  insert into public.voters (full_name, matric, department, level, email, auth_user_id, password_hash, status)
  values (
    trim(p_full_name),
    v_matric,
    trim(p_department),
    trim(p_level),
    v_email,
    p_auth_user_id,
    public.pgcrypto_crypt(v_matric, public.pgcrypto_gen_salt('md5')),
    'pending'
  )
  returning public.voters.id into v_id;

  return query
  select v.id, v.full_name, v.matric, v.department, v.level, v.email, v.status::text, v.has_voted
  from public.voters v
  where v.id = v_id;
end $$;

create or replace function public.ensure_voter_profile(p_full_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user is required.';
  end if;

  v_email := lower(coalesce(auth.email(), ''));

  insert into public.profiles (id, full_name, role)
  values (auth.uid(), coalesce(nullif(trim(p_full_name), ''), v_email, 'Voter'), 'voter')
  on conflict (id) do update set
    full_name = excluded.full_name,
    role = 'voter',
    updated_at = now();

  if v_email <> '' then
    update public.voters v
    set auth_user_id = auth.uid(),
        updated_at = now()
    where lower(v.email) = v_email
      and v.auth_user_id is null;
  end if;
end $$;

create or replace function public.get_voter_login_by_email(p_email text)
returns table (
  id uuid,
  full_name text,
  matric text,
  department text,
  level text,
  email text,
  status text,
  has_voted boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.full_name, v.matric, v.department, v.level, v.email, v.status::text, v.has_voted
  from public.voters v
  where lower(v.email) = lower(trim(p_email))
  limit 1
$$;

create or replace function public.verify_voter_password(p_email text, p_password text)
returns table (
  id uuid,
  full_name text,
  matric text,
  department text,
  level text,
  email text,
  status text,
  has_voted boolean,
  password_is_default boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select v.id, v.full_name, v.matric, v.department, v.level, v.email, v.status::text, v.has_voted, v.password_changed_at is null
  from public.voters v
  where lower(v.email) = lower(trim(p_email))
    and (
      (v.password_hash is not null and v.password_hash = public.pgcrypto_crypt(p_password, v.password_hash))
      or (v.password_changed_at is null and upper(trim(p_password)) = upper(v.matric))
    )
  limit 1;
end $$;

create or replace function public.change_voter_password(p_voter_id uuid, p_current_password text, p_new_password text)
returns table (
  id uuid,
  full_name text,
  matric text,
  department text,
  level text,
  email text,
  status text,
  has_voted boolean,
  password_is_default boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.voters%rowtype;
begin
  if length(coalesce(p_new_password, '')) < 6 then
    raise exception 'New password must be at least 6 characters.';
  end if;

  select * into v_row
  from public.voters v
  where v.id = p_voter_id;

  if v_row.id is null then
    raise exception 'Voter record was not found.';
  end if;
  if upper(trim(p_new_password)) = upper(v_row.matric) then
    raise exception 'New password must not be your matric number.';
  end if;
  if not (
    (v_row.password_hash is not null and v_row.password_hash = public.pgcrypto_crypt(p_current_password, v_row.password_hash))
    or (v_row.password_changed_at is null and upper(trim(p_current_password)) = upper(v_row.matric))
  ) then
    raise exception 'Current password is incorrect.';
  end if;

  update public.voters v
  set password_hash = public.pgcrypto_crypt(p_new_password, public.pgcrypto_gen_salt('md5')),
      password_changed_at = now(),
      updated_at = now()
  where v.id = p_voter_id
  returning * into v_row;

  return query
  select v_row.id, v_row.full_name, v_row.matric, v_row.department, v_row.level, v_row.email, v_row.status::text, v_row.has_voted, false;
end $$;

create or replace function public.get_voter_login_by_matric(p_matric text)
returns table (
  id uuid,
  full_name text,
  matric text,
  department text,
  level text,
  email text,
  status text,
  has_voted boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.full_name, v.matric, v.department, v.level, v.email, v.status::text, v.has_voted
  from public.voters v
  where lower(v.matric) = lower(trim(p_matric))
  limit 1
$$;

create or replace function public.verify_voter(p_matric text, p_department text, p_email text)
returns table (
  id uuid,
  full_name text,
  matric text,
  department text,
  level text,
  email text,
  status text,
  has_voted boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.full_name, v.matric, v.department, v.level, v.email, v.status::text, v.has_voted
  from public.voters v
  where lower(v.matric) = lower(trim(p_matric))
    and v.department = p_department
    and lower(v.email) = lower(trim(p_email))
  limit 1
$$;

create or replace function public.get_candidate_results_safe()
returns table (
  candidate_id uuid,
  position_id uuid,
  election_id uuid,
  full_name text,
  vote_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select cr.candidate_id, cr.position_id, cr.election_id, cr.full_name, cr.vote_count
  from public.candidate_results cr
$$;

create or replace function public.get_election_stats_safe()
returns table (
  election_id uuid,
  registered_voters int,
  approved_voters int,
  pending_voters int,
  voted_voters int,
  ballots_cast int
)
language sql
stable
security definer
set search_path = public
as $$
  select es.election_id, es.registered_voters, es.approved_voters, es.pending_voters, es.voted_voters, es.ballots_cast
  from public.election_stats es
  order by es.election_id
  limit 1
$$;

create or replace function public.get_public_receipts_safe()
returns table (
  receipt_hash text,
  block_hash text,
  block_number bigint,
  validation_status text,
  anonymous_verification_id text,
  confirmation_count int,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select b.receipt_hash, b.block_hash, b.block_number, b.validation_status, b.anonymous_verification_id, b.confirmation_count, b.created_at
  from public.ballots b
  order by b.created_at desc
  limit 30
$$;

create or replace function public.get_voter_ballot_status_safe(
  p_election_id uuid,
  p_voter_id uuid
)
returns table (
  has_ballot boolean,
  election_title text,
  receipt_hash text,
  block_hash text,
  block_number bigint,
  validation_status text,
  anonymous_verification_id text,
  confirmation_count int,
  validator_votes jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    true,
    e.title,
    coalesce(b.receipt_hash, bl.receipt_hash),
    coalesce(b.block_hash, bl.block_hash),
    coalesce(b.block_number, bl.block_number),
    coalesce(b.validation_status, bl.validation_status),
    coalesce(b.anonymous_verification_id, bl.anonymous_verification_id),
    coalesce(b.confirmation_count, bl.confirmation_count),
    coalesce(b.validator_votes, bl.validator_votes),
    coalesce(b.created_at, bl.created_at)
  from public.ballots b
  left join public.blocks bl on bl.id = b.block_id
  left join public.elections e on e.id = b.election_id
  where b.election_id = p_election_id
    and b.voter_id = p_voter_id
  order by b.created_at desc
  limit 1
$$;

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
  v_role text;
  v_status public.election_status;
  v_ledger_status text;
begin
  v_role := public.current_user_role();

  if v_role not in ('superadmin', 'commissioner') then
    raise exception 'Only superadmins and commissioners can update election settings.';
  end if;

  if coalesce(nullif(p_status, ''), 'inactive') not in ('inactive', 'standby', 'active', 'ended', 'finalized') then
    raise exception 'Invalid election status. Use inactive, standby, active, ended, or finalized.';
  end if;

  v_status := coalesce(nullif(p_status, ''), 'inactive')::public.election_status;

  if v_role = 'commissioner' and v_status = 'finalized' then
    raise exception 'Only superadmins can finalize an immutable election ledger.';
  end if;

  if v_role = 'commissioner' and v_status not in ('inactive', 'active', 'ended') then
    raise exception 'Commissioners can only start, pause, or end elections.';
  end if;

  v_ledger_status := case
    when v_status = 'finalized' then 'finalized'
    when v_status = 'ended' then 'ready_to_finalize'
    when v_status = 'inactive' then 'locked'
    else 'open'
  end;

  select e.id into v_id from public.elections e order by e.created_at desc limit 1;
  if v_id is null then
    if v_role <> 'superadmin' then
      raise exception 'Only superadmins can create election settings.';
    end if;

    insert into public.elections (title, status, ledger_status, starts_at, ends_at, finalized_at)
    values (
      coalesce(nullif(trim(p_title), ''), 'WUCC'),
      v_status,
      v_ledger_status,
      p_starts_at,
      p_ends_at,
      case when v_status = 'finalized' then now() else null end
    )
    returning id into v_id;
  else
    if v_status = 'finalized' then
      update public.votes v set finalized_at = coalesce(v.finalized_at, now()) where v.election_id = v_id and v.finalized_at is null;
      update public.ballots b set finalized_at = coalesce(b.finalized_at, now()) where b.election_id = v_id and b.finalized_at is null;
      update public.blocks bl set finalized_at = coalesce(bl.finalized_at, now()) where bl.election_id = v_id and bl.finalized_at is null;
    end if;

    update public.elections e
    set title = case when v_role = 'superadmin' then coalesce(nullif(trim(p_title), ''), e.title) else e.title end,
        status = v_status,
        ledger_status = v_ledger_status,
        starts_at = case when v_role = 'superadmin' then p_starts_at when v_status = 'active' then coalesce(p_starts_at, e.starts_at, now()) else e.starts_at end,
        ends_at = case when v_role = 'superadmin' then p_ends_at when v_status = 'ended' then coalesce(p_ends_at, e.ends_at, now()) else e.ends_at end,
        finalized_at = case
          when v_status = 'finalized' then coalesce(e.finalized_at, now())
          else null
        end,
        updated_at = now()
    where e.id = v_id;
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

create or replace function public.reset_current_election_data()
returns table (success boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_election_id uuid;
begin
  if public.current_user_role() <> 'superadmin' then
    raise exception 'Only superadmins can reset election data.';
  end if;

  select e.id into v_election_id from public.elections e order by e.created_at desc limit 1;
  if v_election_id is null then
    raise exception 'No election is available to reset.';
  end if;

  delete from public.votes v where v.election_id = v_election_id;
  delete from public.ballots b where b.election_id = v_election_id;
  delete from public.blocks bl where bl.election_id = v_election_id;
  update public.voters v set has_voted = false, updated_at = now() where v.has_voted = true;
  update public.elections e
  set status = 'inactive',
      ledger_status = 'open',
      starts_at = null,
      ends_at = null,
      finalized_at = null,
      updated_at = now()
  where e.id = v_election_id;

  return query select true, 'Election votes, receipts, and ledger blocks reset.';
end $$;

-- Creates a new blockchain election cycle without deleting historical ledger data.
-- The previous election is finalized/locked so its votes, ballots, receipts, blocks,
-- and results remain immutable and verifiable while a fresh inactive election is opened.
create or replace function public.create_new_election_cycle(
  p_title text,
  p_academic_year text default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_keep_approved_voters boolean default true,
  p_reopen_candidate_applications boolean default true
)
returns public.elections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_id uuid;
  v_old_status text;
  v_old_ledger_status text;
  v_new_election public.elections%rowtype;
begin
  if public.current_user_role() <> 'superadmin' then
    raise exception 'Only superadmins can create a new election cycle.';
  end if;

  if nullif(trim(p_title), '') is null then
    raise exception 'Election title is required.';
  end if;

  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'End date must be after start date.';
  end if;

  select e.id, e.status::text, e.ledger_status
  into v_old_id, v_old_status, v_old_ledger_status
  from public.elections e
  order by e.created_at desc
  limit 1;

  if v_old_id is not null and v_old_status <> 'finalized' and coalesce(v_old_ledger_status, 'open') <> 'finalized' then
    -- Finalize an unfinished previous election by locking only the election header.
    -- Ledger rows are never updated here; finalized votes, ballots, receipts,
    -- blocks, and results must remain untouched for immutability.
    update public.elections e
    set status = 'finalized',
        ledger_status = 'finalized',
        finalized_at = coalesce(e.finalized_at, now()),
        archived_at = coalesce(e.archived_at, now()),
        updated_at = now()
    where e.id = v_old_id;
  end if;

  insert into public.elections (
    title,
    academic_year,
    candidate_applications_open,
    status,
    ledger_status,
    starts_at,
    ends_at
  )
  values (
    trim(p_title),
    nullif(trim(coalesce(p_academic_year, '')), ''),
    coalesce(p_reopen_candidate_applications, true),
    'inactive',
    'open',
    p_starts_at,
    p_ends_at
  )
  returning * into v_new_election;

  if v_old_id is not null then
    -- Seed the new election with the same offices only. Candidates, votes,
    -- ballots, receipts, and blocks remain tied to their original election_id.
    insert into public.positions (election_id, slug, title, icon, display_order, is_active)
    select v_new_election.id, p.slug, p.title, p.icon, p.display_order, p.is_active
    from public.positions p
    where p.election_id = v_old_id
      and p.is_active = true
      and not exists (
        select 1
        from public.positions existing_position
        where existing_position.election_id = v_new_election.id
          and existing_position.slug = p.slug
      );
  end if;

  -- Ensure every new cycle has the standard WUCC offices even if the
  -- previous cycle had no position seed rows to copy.
  insert into public.positions (election_id, slug, title, icon, display_order, is_active)
  select v_new_election.id, seed.slug, seed.title, seed.icon, seed.display_order, true
  from (values
    ('governor', 'Governor', 'crown', 1),
    ('deputy-governor', 'Deputy Governor', 'shield', 2),
    ('gsec', 'General Secretary', 'file-text', 3),
    ('agsec', 'Assistant General Secretary', 'clipboard-list', 4),
    ('fsec', 'Financial Secretary', 'wallet', 5),
    ('pro', 'Public Relations Officer', 'megaphone', 6),
    ('dwelfare', 'Director of Welfare', 'heart-handshake', 7),
    ('dhealth', 'Director of Health', 'activity', 8),
    ('dsport', 'Director of Sports', 'trophy', 9),
    ('dsocials', 'Director of Socials', 'music', 10)
  ) as seed(slug, title, icon, display_order)
  where not exists (
    select 1
    from public.positions existing_position
    where existing_position.election_id = v_new_election.id
      and existing_position.slug = seed.slug
  );

  if coalesce(p_keep_approved_voters, true) then
    -- Approved voters are preserved but their voting flag is reset for the new election.
    -- Actual voting history is still enforced per election_id by ballots/votes.
    update public.voters v
    set has_voted = false,
        updated_at = now()
    where v.has_voted = true;
  else
    update public.voters v
    set status = 'pending',
        has_voted = false,
        updated_at = now()
    where v.status = 'approved' or v.has_voted = true;
  end if;

  perform public.write_audit_log(
    'election_cycle_created',
    'elections',
    v_new_election.id,
    jsonb_build_object(
      'previous_election_id', v_old_id,
      'previous_status', v_old_status,
      'previous_ledger_status', v_old_ledger_status,
      'keep_approved_voters', coalesce(p_keep_approved_voters, true),
      'reopen_candidate_applications', coalesce(p_reopen_candidate_applications, true)
    )
  );

  return v_new_election;
end $$;

comment on function public.create_new_election_cycle(text,text,timestamptz,timestamptz,boolean,boolean)
is 'Finalizes the current immutable blockchain ledger and creates a fresh inactive election cycle without deleting historical votes, receipts, blocks, or results.';

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

create or replace function public.set_voter_status(p_voter_id uuid, p_status text)
returns public.voters
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.voters%rowtype;
begin
  if public.current_user_role() not in ('superadmin', 'commissioner') then
    raise exception 'Only superadmins and commissioners can manage voters.';
  end if;
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Invalid voter status.';
  end if;

  update public.voters v
  set status = p_status::public.record_status,
      updated_at = now()
  where v.id = p_voter_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Voter record was not found.';
  end if;

  return v_row;
end $$;

create or replace function public.delete_voter(p_voter_id uuid)
returns table (success boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_election_status text;
begin
  if public.current_user_role() <> 'superadmin' then
    raise exception 'Only superadmins can remove voters.';
  end if;
  select e.status::text into v_election_status
  from public.elections e
  order by e.created_at desc
  limit 1;
  if coalesce(v_election_status, 'inactive') not in ('inactive', 'standby') then
    raise exception 'Voters can only be removed when election status is inactive or standby. Current status: %.', v_election_status;
  end if;
  if exists (select 1 from public.votes v where v.voter_id = p_voter_id) then
    raise exception 'This voter already has ledger activity and cannot be removed.';
  end if;

  delete from public.voters v
  where v.id = p_voter_id;

  if not found then
    raise exception 'Voter record was not found or cannot be removed.';
  end if;

  return query select true, 'Voter removed.';
end $$;

create or replace function public.set_candidate_application_status(p_application_id uuid, p_status text)
returns public.candidate_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.candidate_applications%rowtype;
  v_election_status text;
begin
  if public.current_user_role() not in ('superadmin', 'commissioner') then
    raise exception 'Only superadmins and commissioners can manage candidate applications.';
  end if;
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Invalid candidate application status.';
  end if;

  select e.status::text into v_election_status
  from public.candidate_applications ca
  join public.elections e on e.id = ca.election_id
  where ca.id = p_application_id;

  if coalesce(v_election_status, 'inactive') not in ('inactive', 'standby') then
    raise exception 'Candidate approvals are locked once election becomes active.';
  end if;

  update public.candidate_applications ca
  set status = p_status::public.record_status,
      updated_at = now()
  where ca.id = p_application_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Candidate application was not found.';
  end if;

  return v_row;
end $$;

create or replace function public.set_candidate_status(p_candidate_id uuid, p_status text)
returns public.candidates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.candidates%rowtype;
  v_election_status text;
begin
  if public.current_user_role() not in ('superadmin', 'commissioner') then
    raise exception 'Only superadmins and commissioners can manage candidates.';
  end if;
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Invalid candidate status.';
  end if;

  select e.status::text into v_election_status
  from public.candidates c
  join public.elections e on e.id = c.election_id
  where c.id = p_candidate_id;

  if coalesce(v_election_status, 'inactive') not in ('inactive', 'standby') then
    raise exception 'Candidate approvals are locked once election becomes active.';
  end if;

  if p_status = 'approved' and exists (
    select 1
    from public.candidates target
    join public.candidates other on other.election_id = target.election_id
    where target.id = p_candidate_id
      and other.id <> target.id
      and other.status = 'approved'
      and (
        upper(other.matric) = upper(target.matric)
        or (
          nullif(trim(coalesce(target.email, '')), '') is not null
          and lower(other.email) = lower(target.email)
        )
      )
  ) then
    raise exception 'An approved candidate with this matric number or email already exists.';
  end if;

  update public.candidates c
  set status = p_status::public.record_status,
      updated_at = now()
  where c.id = p_candidate_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Candidate was not found.';
  end if;

  return v_row;
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
  if public.current_user_role() <> 'superadmin' then
    raise exception 'Only superadmins can remove candidates.';
  end if;
  select e.status::text into v_election_status
  from public.elections e
  order by e.created_at desc
  limit 1;
  if coalesce(v_election_status, 'inactive') not in ('inactive', 'standby') then
    raise exception 'Candidates can only be removed when election status is inactive or standby. Current status: %.', v_election_status;
  end if;
  if exists (select 1 from public.votes v where v.candidate_id = p_candidate_id) then
    raise exception 'This candidate already has ledger activity and cannot be removed.';
  end if;

  delete from public.candidates c
  where c.id = p_candidate_id;

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
  if public.current_user_role() <> 'superadmin' then
    raise exception 'Only superadmins can remove candidate applications.';
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

  delete from public.candidate_applications ca
  where ca.id = p_application_id;

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

create or replace function public.prevent_closed_candidate_applications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_applications_open boolean;
begin
  select e.status::text, coalesce(e.candidate_applications_open, true)
  into v_status, v_applications_open
  from public.elections e
  where e.id = new.election_id;

  if v_status is null
     or v_status not in ('inactive', 'standby')
     or not v_applications_open then
    raise exception 'Applications are closed for the current election cycle.';
  end if;

  return new;
end $$;

create or replace function public.cast_ballot(
  p_matric text,
  p_department text,
  p_email text,
  p_selections jsonb
)
returns table (
  tx_hash text,
  receipt_hash text,
  block_hash text,
  voter_hash text,
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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_election public.elections%rowtype;
  v_voter public.voters%rowtype;
  v_block_id uuid;
  v_ballot_id uuid;
  v_block_number bigint;
  v_tx_hash text := '0x' || encode(public.pgcrypto_random_bytes(32), 'hex');
  v_receipt_hash text;
  v_vote_hash text;
  v_selection_hash text;
  v_block_hash text;
  v_voter_hash text := '0x' || encode(public.pgcrypto_digest(lower(trim(p_matric)) || ':' || now()::text, 'sha256'), 'hex');
  v_previous_hash text;
  v_validator_votes jsonb := '{"validator_1":true,"validator_2":true,"validator_3":true,"validator_4":false,"validator_5":true}'::jsonb;
  v_confirmation_count int := 4;
  v_anonymous_verification_id text := 'WUCC-' || upper(encode(public.pgcrypto_random_bytes(8), 'hex'));
  item jsonb;
  v_position_id uuid;
  v_candidate_id uuid;
  v_required_positions int;
  v_selected_positions int;
  v_total_selections int;
begin
  select * into v_election
  from public.elections e
  where e.status = 'active'
    and e.ledger_status = 'open'
    and (e.starts_at is null or now() >= e.starts_at)
    and (e.ends_at is null or now() < e.ends_at)
  order by e.created_at desc
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

  if v_voter.id is null then raise exception 'Voter not found.'; end if;
  if v_voter.status <> 'approved' then raise exception 'Voter is not approved.'; end if;
  if v_voter.has_voted then raise exception 'Voter has already voted.'; end if;

  select count(*) into v_required_positions
  from public.positions p
  where p.election_id = v_election.id and p.is_active = true;

  select count(*) into v_total_selections
  from jsonb_array_elements(p_selections);

  select count(distinct (value->>'position_id')) into v_selected_positions
  from jsonb_array_elements(p_selections);

  if v_required_positions = 0 or v_total_selections <> v_required_positions or v_selected_positions <> v_required_positions then
    raise exception 'Select one valid candidate for every position before submitting.';
  end if;

  select coalesce(max(bl.block_number), 1200) + 1 into v_block_number
  from public.blocks bl
  where bl.election_id = v_election.id;

  select bl.block_hash into v_previous_hash
  from public.blocks bl
  where bl.election_id = v_election.id
  order by bl.block_number desc
  limit 1;

  v_receipt_hash := '0x' || encode(public.pgcrypto_digest(v_election.id::text || ':' || v_voter.id::text || ':' || v_block_number::text || ':' || v_tx_hash, 'sha256'), 'hex');
  v_vote_hash := '0x' || encode(public.pgcrypto_digest(v_receipt_hash || ':' || v_voter_hash || ':ballot', 'sha256'), 'hex');
  v_block_hash := '0x' || encode(public.pgcrypto_digest(coalesce(v_previous_hash, 'genesis') || ':' || v_receipt_hash || ':' || now()::text, 'sha256'), 'hex');

  if v_confirmation_count < 3 then
    raise exception 'PBFT validation failed: at least 3 of 5 validators must confirm.';
  end if;

  insert into public.blocks (
    election_id,
    voter_id,
    block_number,
    tx_hash,
    vote_hash,
    receipt_hash,
    block_hash,
    voter_hash,
    previous_hash,
    validator_status,
    validation_status,
    consensus_status,
    validator_votes,
    validator_confirmations,
    confirmation_count,
    anonymous_verification_id
  )
  values (
    v_election.id,
    v_voter.id,
    v_block_number,
    v_tx_hash,
    v_vote_hash,
    v_receipt_hash,
    v_block_hash,
    left(v_voter_hash, 18),
    v_previous_hash,
    'pbft_confirmed',
    'pbft_confirmed',
    'confirmed',
    v_validator_votes,
    v_confirmation_count,
    v_confirmation_count,
    v_anonymous_verification_id
  )
  returning id into v_block_id;

  -- PBFT/consortium simulation: only a confirmed block produces a
  -- ballot receipt, and only ballot-linked selections are counted.
  insert into public.ballots (
    election_id,
    voter_id,
    block_id,
    block_number,
    tx_hash,
    vote_hash,
    receipt_hash,
    block_hash,
    previous_hash,
    voter_hash,
    validator_status,
    validation_status,
    consensus_status,
    validator_votes,
    validator_confirmations,
    confirmation_count,
    anonymous_verification_id
  )
  values (
    v_election.id,
    v_voter.id,
    v_block_id,
    v_block_number,
    v_tx_hash,
    v_vote_hash,
    v_receipt_hash,
    v_block_hash,
    v_previous_hash,
    left(v_voter_hash, 18),
    'pbft_confirmed',
    'pbft_confirmed',
    'confirmed',
    v_validator_votes,
    v_confirmation_count,
    v_confirmation_count,
    v_anonymous_verification_id
  )
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
      join public.positions p on p.id = c.position_id and p.election_id = c.election_id
      where c.id = v_candidate_id
        and c.position_id = v_position_id
        and c.election_id = v_election.id
        and c.status = 'approved'
        and p.is_active = true
    ) then
      raise exception 'Invalid candidate selection.';
    end if;

    v_selection_hash := '0x' || encode(public.pgcrypto_digest(v_receipt_hash || ':' || v_position_id::text || ':' || v_candidate_id::text, 'sha256'), 'hex');

    insert into public.votes (
      election_id,
      ballot_id,
      block_id,
      voter_id,
      position_id,
      candidate_id,
      vote_hash,
      receipt_hash,
      block_hash,
      validation_status,
      consensus_status
    )
    values (
      v_election.id,
      v_ballot_id,
      v_block_id,
      v_voter.id,
      v_position_id,
      v_candidate_id,
      v_selection_hash,
      v_receipt_hash,
      v_block_hash,
      'pbft_confirmed',
      'confirmed'
    );
  end loop;

  update public.voters v set has_voted = true, updated_at = now() where v.id = v_voter.id;

  return query
  select
    b.tx_hash,
    b.receipt_hash,
    b.block_hash,
    b.voter_hash,
    b.block_number,
    b.validation_status,
    b.anonymous_verification_id,
    b.confirmation_count,
    b.validator_votes,
    b.created_at,
    e.title,
    e.ledger_status,
    e.status::text
  from public.ballots b
  join public.elections e on e.id = b.election_id
  where b.id = v_ballot_id;
end $$;

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
    e.title,
    e.ledger_status,
    e.status::text
  from public.ballots b
  join public.elections e on e.id = b.election_id
  where lower(coalesce(b.receipt_hash, '')) = lower(trim(coalesce(p_receipt_hash, '')))
     or lower(coalesce(b.block_hash, '')) = lower(trim(coalesce(p_receipt_hash, '')))
     or lower(coalesce(b.tx_hash, '')) = lower(trim(coalesce(p_receipt_hash, '')))
     or lower(coalesce(b.anonymous_verification_id, '')) = lower(trim(coalesce(p_receipt_hash, '')))
  limit 1
$$;

create or replace function public.promote_approved_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    if exists (
      select 1
      from public.candidates c
      where c.election_id = new.election_id
        and c.status = 'approved'
        and c.application_id is distinct from new.id
        and upper(c.matric) = upper(new.matric)
    ) then
      raise exception 'An approved candidate with this matric number already exists.';
    end if;

    if nullif(trim(coalesce(new.email, '')), '') is not null and exists (
      select 1
      from public.candidates c
      where c.election_id = new.election_id
        and c.status = 'approved'
        and c.application_id is distinct from new.id
        and lower(c.email) = lower(new.email)
    ) then
      raise exception 'An approved candidate with this email already exists.';
    end if;

    insert into public.candidates (
      election_id,
      position_id,
      application_id,
      full_name,
      matric,
      email,
      department,
      level,
      manifesto,
      promises,
      cgpa,
      photo_url,
      status
    )
    values (
      new.election_id,
      new.position_id,
      new.id,
      new.full_name,
      new.matric,
      new.email,
      new.department,
      new.level,
      new.manifesto,
      new.promises,
      new.cgpa,
      new.photo_url,
      'approved'
    )
    on conflict (election_id, position_id, matric) do update set
      full_name = excluded.full_name,
      email = excluded.email,
      department = excluded.department,
      level = excluded.level,
      manifesto = excluded.manifesto,
      promises = excluded.promises,
      cgpa = excluded.cgpa,
      photo_url = excluded.photo_url,
      status = 'approved',
      updated_at = now();
  elsif new.status = 'rejected' and old.status is distinct from new.status then
    update public.candidates c
    set status = 'rejected',
        updated_at = now()
    where c.application_id = new.id;
  end if;

  return new;
end $$;

create trigger candidate_application_approved
after update of status on public.candidate_applications
for each row
execute function public.promote_approved_application();

drop trigger if exists prevent_closed_candidate_applications on public.candidate_applications;
create trigger prevent_closed_candidate_applications
before insert on public.candidate_applications
for each row execute function public.prevent_closed_candidate_applications();

create or replace view public.blockchain_ledger as
select
  b.id,
  b.election_id,
  e.title as election_title,
  e.status::text as election_status,
  e.ledger_status,
  b.block_number,
  b.tx_hash,
  b.vote_hash,
  b.receipt_hash,
  b.block_hash,
  b.previous_hash,
  b.validator_status,
  b.validation_status,
  b.consensus_status,
  b.validator_votes,
  b.validator_confirmations,
  b.confirmation_count,
  b.anonymous_verification_id,
  b.finalized_at,
  b.created_at
from public.blocks b
join public.elections e on e.id = b.election_id;

create or replace view public.vote_receipts as
select
  b.vote_hash,
  b.receipt_hash,
  b.block_hash,
  b.block_number,
  b.previous_hash,
  b.validation_status,
  b.consensus_status,
  b.validator_confirmations,
  b.confirmation_count,
  b.anonymous_verification_id,
  b.finalized_at,
  b.created_at
from public.ballots b;

create or replace view public.admins as
select
  p.id,
  p.full_name,
  p.role,
  p.created_at
from public.profiles p
where p.role in ('superadmin', 'commissioner', 'observer');

insert into public.elections (title, status, ledger_status, starts_at, ends_at)
values ('WUCC', 'standby', 'open', now() + interval '15 minutes', now() + interval '8 hours');

alter table public.profiles enable row level security;
alter table public.elections enable row level security;
alter table public.positions enable row level security;
alter table public.voters enable row level security;
alter table public.candidate_applications enable row level security;
alter table public.candidates enable row level security;
alter table public.blocks enable row level security;
alter table public.ballots enable row level security;
alter table public.votes enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles read own or admins read" on public.profiles
for select using (id = auth.uid() or public.is_admin_or_observer());

create policy "superadmins manage profiles" on public.profiles
for all using (public.current_user_role() = 'superadmin')
with check (public.current_user_role() = 'superadmin');

create policy "public reads elections" on public.elections
for select using (true);

create policy "admins manage elections" on public.elections
for all using (public.is_election_admin())
with check (public.is_election_admin());

create policy "public reads active positions" on public.positions
for select using (is_active = true);

create policy "admins manage positions" on public.positions
for all using (public.is_election_admin())
with check (public.is_election_admin());

create policy "admins observers read voters" on public.voters
for select using (public.is_admin_or_observer());

create policy "voters read own voter row" on public.voters
for select using (auth_user_id = auth.uid());

create policy "admins insert voters" on public.voters
for insert with check (public.is_election_admin());

create policy "admins update voters" on public.voters
for update using (public.is_election_admin())
with check (public.is_election_admin());

create policy "admins delete voters" on public.voters
for delete using (public.is_election_admin() and public.election_allows_pre_start_management());

create policy "public submits applications" on public.candidate_applications
for insert with check (true);

create policy "admins observers read applications" on public.candidate_applications
for select using (public.is_admin_or_observer());

create policy "admins update applications" on public.candidate_applications
for update using (public.is_election_admin())
with check (public.is_election_admin());

create policy "admins delete applications" on public.candidate_applications
for delete using (public.is_election_admin() and public.election_allows_pre_start_management());

create policy "public reads approved candidates" on public.candidates
for select using (status = 'approved');

create policy "admins read candidates" on public.candidates
for select using (public.is_admin_or_observer());

create policy "admins insert candidates" on public.candidates
for insert with check (public.is_election_admin());

create policy "admins update candidates" on public.candidates
for update using (public.is_election_admin())
with check (public.is_election_admin());

create policy "admins delete candidates" on public.candidates
for delete using (public.is_election_admin() and public.election_allows_pre_start_management());

create policy "admins observers read audit logs" on public.audit_logs
for select using (public.is_admin_or_observer());

grant usage on schema public to anon, authenticated;
grant execute on function public.pgcrypto_gen_salt(text) to anon, authenticated;
grant execute on function public.pgcrypto_crypt(text,text) to anon, authenticated;
grant execute on function public.pgcrypto_digest(text,text) to anon, authenticated;
grant execute on function public.pgcrypto_random_bytes(int) to anon, authenticated;
grant execute on function public.pgcrypto_random_uuid() to anon, authenticated;
grant execute on function public.check_voter_duplicate(text,text,uuid) to anon, authenticated;
grant execute on function public.check_candidate_application_duplicate(uuid,uuid,text,text) to anon, authenticated;
grant select on public.elections, public.positions, public.candidates, public.candidate_results, public.election_stats, public.blockchain_ledger, public.vote_receipts to anon, authenticated;
grant select on public.admins to authenticated;
grant insert on public.candidate_applications to anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.voters, public.candidate_applications, public.positions, public.candidates, public.elections to authenticated;
grant delete on public.voters, public.candidate_applications, public.candidates to authenticated;
grant select on public.audit_logs to authenticated;
grant execute on function public.normalize_user_role(text) to anon, authenticated;
grant execute on function public.register_voter(text,text,text,text,text,uuid) to anon, authenticated;
grant execute on function public.ensure_voter_profile(text) to authenticated;
grant execute on function public.get_voter_login_by_email(text) to anon, authenticated;
grant execute on function public.get_voter_login_by_matric(text) to anon, authenticated;
grant execute on function public.verify_voter_password(text,text) to anon, authenticated;
grant execute on function public.change_voter_password(uuid,text,text) to anon, authenticated;

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

create unique index if not exists voter_password_reset_one_pending on public.voter_password_reset_requests(voter_id) where status = 'pending';
create index if not exists idx_voter_password_reset_status on public.voter_password_reset_requests(status, created_at desc);

drop trigger if exists voter_password_reset_touch_updated_at on public.voter_password_reset_requests;
create trigger voter_password_reset_touch_updated_at before update on public.voter_password_reset_requests for each row execute function public.touch_updated_at();

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
  select * into v_voter from public.voters v where lower(v.email) = lower(trim(p_email)) and upper(v.matric) = upper(trim(p_matric)) and v.status = 'approved' limit 1;
  if v_voter.id is not null then
    insert into public.voter_password_reset_requests(voter_id, requested_email, requested_matric)
    values (v_voter.id, lower(trim(p_email)), upper(trim(p_matric)))
    on conflict (voter_id) where status = 'pending'
    do update set requested_email = excluded.requested_email, requested_matric = excluded.requested_matric, requested_at = now(), updated_at = now()
    returning id into v_request_id;
    perform public.write_audit_log('voter_password_reset_requested', 'voter_password_reset_requests', v_request_id, jsonb_build_object('voter_id', v_voter.id));
  end if;
  return query select true, v_message;
end $$;

create or replace function public.approve_voter_password_reset(p_request_id uuid)
returns table (id uuid, voter_id uuid, status text, password_is_default boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.voter_password_reset_requests%rowtype;
  v_voter public.voters%rowtype;
begin
  if public.current_user_role() not in ('superadmin', 'commissioner') then raise exception 'Only election admins can approve password reset requests.'; end if;
  select * into v_request from public.voter_password_reset_requests r where r.id = p_request_id for update;
  if v_request.id is null then raise exception 'Password reset request was not found.'; end if;
  if v_request.status <> 'pending' then raise exception 'Password reset request is not pending.'; end if;
  select * into v_voter from public.voters v where v.id = v_request.voter_id for update;
  if v_voter.id is null or v_voter.status <> 'approved' then raise exception 'Approved voter record was not found.'; end if;
  update public.voters v set password_hash = public.pgcrypto_crypt(upper(v_voter.matric), public.pgcrypto_gen_salt('md5')), password_changed_at = null, updated_at = now() where v.id = v_voter.id;
  update public.voter_password_reset_requests r set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() where r.id = v_request.id returning * into v_request;
  perform public.write_audit_log('voter_password_reset_approved', 'voter_password_reset_requests', v_request.id, jsonb_build_object('voter_id', v_voter.id, 'reviewed_by', auth.uid()));
  return query select v_request.id, v_request.voter_id, v_request.status, true;
end $$;

alter table public.voter_password_reset_requests enable row level security;
drop policy if exists "admins manage voter password reset requests" on public.voter_password_reset_requests;
create policy "admins manage voter password reset requests" on public.voter_password_reset_requests for all using (public.is_election_admin()) with check (public.is_election_admin());
grant select, update on public.voter_password_reset_requests to authenticated;
grant execute on function public.request_voter_password_reset(text,text) to anon, authenticated;
grant execute on function public.approve_voter_password_reset(uuid) to authenticated;
grant execute on function public.verify_voter(text,text,text) to anon, authenticated;
grant execute on function public.cast_ballot(text,text,text,jsonb) to anon, authenticated;
grant execute on function public.verify_vote_receipt(text) to anon, authenticated;
grant execute on function public.write_audit_log(text,text,uuid,jsonb) to authenticated;
grant execute on function public.get_candidate_results_safe() to anon, authenticated;
grant execute on function public.get_election_stats_safe() to anon, authenticated;
grant execute on function public.get_public_receipts_safe() to anon, authenticated;
grant execute on function public.get_voter_ballot_status_safe(uuid,uuid) to anon, authenticated;
grant execute on function public.update_current_election_settings(text,text,timestamptz,timestamptz) to authenticated;
grant execute on function public.reset_current_election_data() to authenticated;
grant execute on function public.create_new_election_cycle(text,text,timestamptz,timestamptz,boolean,boolean) to authenticated;
grant execute on function public.election_allows_pre_start_management() to authenticated;
grant execute on function public.set_voter_status(uuid,text) to authenticated;
grant execute on function public.delete_voter(uuid) to authenticated;
grant execute on function public.delete_voter_record(uuid) to authenticated;
grant execute on function public.set_candidate_application_status(uuid,text) to authenticated;
grant execute on function public.set_candidate_status(uuid,text) to authenticated;
grant execute on function public.delete_candidate(uuid) to authenticated;
grant execute on function public.delete_candidate_application(uuid) to authenticated;
grant execute on function public.delete_candidate_record(uuid) to authenticated;
grant execute on function public.delete_candidate_application_record(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.elections;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.positions;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.candidates;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.voters;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.candidate_applications;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.blocks;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.ballots;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.votes;
exception when duplicate_object then null; when undefined_object then null;
end $$;

-- Password reset RPC cache fix: exact two-argument approval/rejection signatures.
alter table public.voters
  add column if not exists must_change_password boolean not null default false,
  add column if not exists temporary_password_hash text,
  add column if not exists reset_approved_at timestamptz,
  add column if not exists reset_approved_by uuid references public.profiles(id);

alter table public.voter_password_reset_requests
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id),
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references public.profiles(id),
  add column if not exists rejection_reason text;

create unique index if not exists voter_password_reset_one_pending on public.voter_password_reset_requests(voter_id) where status = 'pending';

create or replace function public.approve_voter_password_reset(p_request_id uuid, p_temporary_password text)
returns table (success boolean, id uuid, voter_id uuid, email text, status text, must_change_password boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.voter_password_reset_requests%rowtype;
  v_voter public.voters%rowtype;
  v_temp_password text := trim(coalesce(p_temporary_password, ''));
  v_simple text[] := array['123456', '12345678', 'password', 'qwerty', 'qwerty123', 'voter123', 'admin123'];
begin
  if public.current_user_role() not in ('superadmin', 'commissioner') then raise exception 'Only election admins can approve password reset requests.'; end if;
  select * into v_request from public.voter_password_reset_requests r where r.id = p_request_id for update;
  if v_request.id is null then raise exception 'Password reset request was not found.'; end if;
  if v_request.status <> 'pending' then raise exception 'Password reset request is not pending.'; end if;
  select * into v_voter from public.voters v where v.id = v_request.voter_id for update;
  if v_voter.id is null then raise exception 'Voter record was not found.'; end if;
  if length(v_temp_password) = 0 then raise exception 'Temporary password is required.'; end if;
  if length(v_temp_password) < 8 then raise exception 'Temporary password must be at least 8 characters.'; end if;
  if lower(v_temp_password) = lower(v_voter.matric) then raise exception 'Temporary password must not equal the matric number.'; end if;
  if lower(v_temp_password) = lower(v_voter.email) then raise exception 'Temporary password must not equal the voter email.'; end if;
  if lower(v_temp_password) = any(v_simple) then raise exception 'Temporary password is too simple.'; end if;

  update public.voters v
  set temporary_password_hash = public.pgcrypto_crypt(v_temp_password, public.pgcrypto_gen_salt('md5')),
      must_change_password = true,
      reset_approved_at = now(),
      reset_approved_by = auth.uid(),
      updated_at = now()
  where v.id = v_voter.id;

  update public.voter_password_reset_requests r
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), approved_at = now(), approved_by = auth.uid(), updated_at = now()
  where r.id = v_request.id
  returning * into v_request;

  update public.voter_password_reset_requests r
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejected_at = now(), rejected_by = auth.uid(), rejection_reason = coalesce(r.rejection_reason, 'Superseded by approved reset request.'), updated_at = now()
  where r.voter_id = v_voter.id and r.id <> v_request.id and r.status = 'pending';

  perform public.write_audit_log('password_reset_approved', 'voter_password_reset_requests', v_request.id, jsonb_build_object('voter_id', v_voter.id, 'approved_by', auth.uid()));
  return query select true, v_request.id, v_request.voter_id, v_voter.email, v_request.status, true;
end $$;

create or replace function public.reject_voter_password_reset(p_request_id uuid, p_reason text)
returns table (success boolean, id uuid, voter_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.voter_password_reset_requests%rowtype;
begin
  if public.current_user_role() not in ('superadmin', 'commissioner') then raise exception 'Only election admins can reject password reset requests.'; end if;
  update public.voter_password_reset_requests r
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejected_at = now(), rejected_by = auth.uid(), rejection_reason = nullif(trim(coalesce(p_reason, '')), ''), updated_at = now()
  where r.id = p_request_id and r.status = 'pending'
  returning * into v_request;
  if v_request.id is null then raise exception 'Password reset request was not found or is not pending.'; end if;
  perform public.write_audit_log('password_reset_rejected', 'voter_password_reset_requests', v_request.id, jsonb_build_object('voter_id', v_request.voter_id, 'rejected_by', auth.uid(), 'reason', nullif(trim(coalesce(p_reason, '')), '')));
  return query select true, v_request.id, v_request.voter_id, v_request.status;
end $$;

grant execute on function public.approve_voter_password_reset(uuid,text) to authenticated;
grant execute on function public.reject_voter_password_reset(uuid,text) to authenticated;
notify pgrst, 'reload schema';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidate-photos',
  'candidate-photos',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public reads candidate photos" on storage.objects;
create policy "public reads candidate photos"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'candidate-photos');

drop policy if exists "public uploads candidate photos" on storage.objects;
create policy "public uploads candidate photos"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'candidate-photos'
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
);

drop function if exists public.change_voter_password(uuid,text,text);

create or replace function public.change_voter_password(p_voter_id uuid, p_current_password text, p_new_password text)
returns table (
  id uuid,
  full_name text,
  matric text,
  department text,
  level text,
  email text,
  status text,
  has_voted boolean,
  password_is_default boolean,
  must_change_password boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.voters%rowtype;
begin
  if coalesce(p_current_password, '') = '' then
    raise exception 'Current password is required.';
  end if;

  if length(coalesce(p_new_password, '')) < 6 then
    raise exception 'New password must be at least 6 characters.';
  end if;

  select * into v_row
  from public.voters v
  where v.id = p_voter_id
  for update;

  if v_row.id is null then
    raise exception 'Voter record was not found.';
  end if;

  if upper(trim(p_new_password)) = upper(trim(v_row.matric)) then
    raise exception 'New password must not be your matric number.';
  end if;

  if coalesce(v_row.must_change_password, false) then
    if not (
      v_row.temporary_password_hash is not null
      and v_row.temporary_password_hash = public.pgcrypto_crypt(p_current_password, v_row.temporary_password_hash)
    ) then
      raise exception 'Current password is incorrect.';
    end if;
  elsif not (
    (v_row.password_hash is not null and v_row.password_hash = public.pgcrypto_crypt(p_current_password, v_row.password_hash))
    or (v_row.password_changed_at is null and upper(trim(coalesce(p_current_password, ''))) = upper(trim(v_row.matric)))
  ) then
    raise exception 'Current password is incorrect.';
  end if;

  update public.voters v
  set password_hash = public.pgcrypto_crypt(p_new_password, public.pgcrypto_gen_salt('md5')),
      password_changed_at = now(),
      must_change_password = false,
      temporary_password_hash = null,
      updated_at = now()
  where v.id = p_voter_id
  returning * into v_row;

  perform public.write_audit_log('password_changed', 'voters', v_row.id, jsonb_build_object('voter_id', v_row.id));

  return query
  select
    v_row.id,
    v_row.full_name,
    v_row.matric,
    v_row.department,
    v_row.level,
    v_row.email,
    v_row.status::text,
    v_row.has_voted,
    false,
    false;
end $$;

grant execute on function public.change_voter_password(uuid,text,text) to anon, authenticated;

notify pgrst, 'reload schema';

drop function if exists public.get_voter_login_by_email(text);
drop function if exists public.verify_voter_password(text,text);

create or replace function public.get_voter_login_by_email(p_email text)
returns table (
  id uuid,
  full_name text,
  matric text,
  department text,
  level text,
  email text,
  status text,
  has_voted boolean,
  password_is_default boolean,
  must_change_password boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.id,
    v.full_name,
    v.matric,
    v.department,
    v.level,
    v.email,
    v.status::text,
    v.has_voted,
    (coalesce(v.must_change_password, false) or v.password_changed_at is null),
    coalesce(v.must_change_password, false)
  from public.voters v
  where lower(trim(coalesce(v.email, ''))) = lower(trim(coalesce(p_email, '')))
  limit 1
$$;

create or replace function public.verify_voter_password(p_email text, p_password text)
returns table (
  id uuid,
  full_name text,
  matric text,
  department text,
  level text,
  email text,
  status text,
  has_voted boolean,
  password_is_default boolean,
  must_change_password boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    v.id,
    v.full_name,
    v.matric,
    v.department,
    v.level,
    v.email,
    v.status::text,
    v.has_voted,
    (coalesce(v.must_change_password, false) or v.password_changed_at is null),
    coalesce(v.must_change_password, false)
  from public.voters v
  where lower(trim(coalesce(v.email, ''))) = lower(trim(coalesce(p_email, '')))
    and (
      (coalesce(v.must_change_password, false) = true and v.temporary_password_hash is not null and v.temporary_password_hash = public.pgcrypto_crypt(p_password, v.temporary_password_hash))
      or (coalesce(v.must_change_password, false) = false and v.password_hash is not null and v.password_hash = public.pgcrypto_crypt(p_password, v.password_hash))
      or (coalesce(v.must_change_password, false) = false and v.password_changed_at is null and upper(trim(coalesce(p_password, ''))) = upper(trim(v.matric)))
    )
  limit 1;
end $$;

grant execute on function public.get_voter_login_by_email(text) to anon, authenticated;
grant execute on function public.verify_voter_password(text,text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
