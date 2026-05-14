alter table public.voters
  add column if not exists must_change_password boolean not null default false,
  add column if not exists temporary_password_hash text,
  add column if not exists reset_approved_at timestamptz,
  add column if not exists reset_approved_by uuid references public.profiles(id);

alter table public.voter_password_reset_requests
  add column if not exists reset_approved_at timestamptz,
  add column if not exists reset_approved_by uuid references public.profiles(id);

drop function if exists public.verify_voter_password(text,text);
drop function if exists public.change_voter_password(uuid,text,text);

create or replace function public.generate_voter_temp_password()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bytes bytea := public.pgcrypto_random_bytes(6);
  v_hex text := upper(encode(v_bytes, 'hex'));
begin
  if (get_byte(v_bytes, 0) % 2) = 0 then
    return 'VT-' || substr(v_hex, 1, 4) || '-' || substr(v_hex, 5, 2);
  end if;
  return 'WUCC#' || substr(v_hex, 1, 4);
end $$;

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
    coalesce(v.must_change_password, false),
    coalesce(v.must_change_password, false)
  from public.voters v
  where lower(v.email) = lower(trim(p_email))
    and (
      (v.must_change_password = true and v.temporary_password_hash is not null and v.temporary_password_hash = public.pgcrypto_crypt(p_password, v.temporary_password_hash))
      or (coalesce(v.must_change_password, false) = false and v.password_hash is not null and v.password_hash = public.pgcrypto_crypt(p_password, v.password_hash))
      or (coalesce(v.must_change_password, false) = false and v.password_changed_at is null and upper(trim(p_password)) = upper(v.matric))
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
  if upper(trim(p_new_password)) = upper(v_row.matric) then
    raise exception 'New password must not be your matric number.';
  end if;

  if coalesce(v_row.must_change_password, false) then
    if not (v_row.temporary_password_hash is not null and v_row.temporary_password_hash = public.pgcrypto_crypt(p_current_password, v_row.temporary_password_hash)) then
      raise exception 'Current password is incorrect.';
    end if;
  elsif not (
    (v_row.password_hash is not null and v_row.password_hash = public.pgcrypto_crypt(p_current_password, v_row.password_hash))
    or (v_row.password_changed_at is null and upper(trim(p_current_password)) = upper(v_row.matric))
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
  select v_row.id, v_row.full_name, v_row.matric, v_row.department, v_row.level, v_row.email, v_row.status::text, v_row.has_voted, false, false;
end $$;

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
    do update set requested_email = excluded.requested_email, requested_matric = excluded.requested_matric, requested_at = now(), updated_at = now()
    returning id into v_request_id;

    perform public.write_audit_log('password_reset_requested', 'voter_password_reset_requests', v_request_id, jsonb_build_object('voter_id', v_voter.id));
  end if;

  return query select true, v_message;
end $$;

create or replace function public.approve_voter_password_reset(p_request_id uuid)
returns table (
  id uuid,
  voter_id uuid,
  email text,
  status text,
  temporary_password text,
  must_change_password boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.voter_password_reset_requests%rowtype;
  v_voter public.voters%rowtype;
  v_temp_password text;
begin
  if public.current_user_role() not in ('superadmin', 'commissioner') then
    raise exception 'Only election admins can approve password reset requests.';
  end if;

  select * into v_request from public.voter_password_reset_requests r where r.id = p_request_id for update;
  if v_request.id is null then raise exception 'Password reset request was not found.'; end if;
  if v_request.status <> 'pending' then raise exception 'Password reset request is not pending.'; end if;

  select * into v_voter from public.voters v where v.id = v_request.voter_id for update;
  if v_voter.id is null or v_voter.status <> 'approved' then raise exception 'Approved voter record was not found.'; end if;

  v_temp_password := public.generate_voter_temp_password();

  update public.voters v
  set temporary_password_hash = public.pgcrypto_crypt(v_temp_password, public.pgcrypto_gen_salt('md5')),
      must_change_password = true,
      reset_approved_at = now(),
      reset_approved_by = auth.uid(),
      updated_at = now()
  where v.id = v_voter.id;

  update public.voter_password_reset_requests r
  set status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      reset_approved_at = now(),
      reset_approved_by = auth.uid(),
      updated_at = now()
  where r.id = v_request.id
  returning * into v_request;

  update public.voter_password_reset_requests r
  set status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where r.voter_id = v_voter.id
    and r.id <> v_request.id
    and r.status = 'pending';

  perform public.write_audit_log('password_reset_approved', 'voter_password_reset_requests', v_request.id, jsonb_build_object('voter_id', v_voter.id, 'reviewed_by', auth.uid()));

  return query select v_request.id, v_request.voter_id, v_voter.email, v_request.status, v_temp_password, true;
end $$;

create or replace function public.reject_voter_password_reset(p_request_id uuid)
returns table (id uuid, voter_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.voter_password_reset_requests%rowtype;
begin
  if public.current_user_role() not in ('superadmin', 'commissioner') then
    raise exception 'Only election admins can reject password reset requests.';
  end if;

  update public.voter_password_reset_requests r
  set status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where r.id = p_request_id
    and r.status = 'pending'
  returning * into v_request;

  if v_request.id is null then
    raise exception 'Password reset request was not found or is not pending.';
  end if;

  perform public.write_audit_log('password_reset_rejected', 'voter_password_reset_requests', v_request.id, jsonb_build_object('voter_id', v_request.voter_id, 'reviewed_by', auth.uid()));

  return query select v_request.id, v_request.voter_id, v_request.status;
end $$;

grant execute on function public.generate_voter_temp_password() to authenticated;
grant execute on function public.reject_voter_password_reset(uuid) to authenticated;

create or replace view public.password_reset_requests as
select
  id,
  voter_id,
  status,
  requested_email,
  requested_matric,
  requested_at,
  reviewed_by,
  reviewed_at,
  reset_approved_at,
  reset_approved_by,
  created_at,
  updated_at
from public.voter_password_reset_requests;

grant select on public.password_reset_requests to authenticated;
