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
  add column if not exists rejection_reason text,
  add column if not exists reset_approved_at timestamptz,
  add column if not exists reset_approved_by uuid references public.profiles(id);

create unique index if not exists voter_password_reset_one_pending
on public.voter_password_reset_requests(voter_id)
where status = 'pending';

drop function if exists public.verify_voter_password(text,text);
drop function if exists public.change_voter_password(uuid,text,text);
drop function if exists public.approve_voter_password_reset(uuid);
drop function if exists public.approve_voter_password_reset(uuid,text);
drop function if exists public.reject_voter_password_reset(uuid);
drop function if exists public.reject_voter_password_reset(uuid,text);

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
      (coalesce(v.must_change_password, false) = true and v.temporary_password_hash is not null and v.temporary_password_hash = public.pgcrypto_crypt(p_password, v.temporary_password_hash))
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

  select * into v_row from public.voters v where v.id = p_voter_id for update;
  if v_row.id is null then raise exception 'Voter record was not found.'; end if;
  if upper(trim(p_new_password)) = upper(v_row.matric) then raise exception 'New password must not be your matric number.'; end if;

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

  return query select v_row.id, v_row.full_name, v_row.matric, v_row.department, v_row.level, v_row.email, v_row.status::text, v_row.has_voted, false, false;
end $$;

create or replace function public.approve_voter_password_reset(p_request_id uuid, p_temporary_password text)
returns table (
  success boolean,
  id uuid,
  voter_id uuid,
  email text,
  status text,
  must_change_password boolean
)
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
  if public.current_user_role() not in ('superadmin', 'commissioner') then
    raise exception 'Only election admins can approve password reset requests.';
  end if;

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
  set status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      approved_at = now(),
      approved_by = auth.uid(),
      reset_approved_at = now(),
      reset_approved_by = auth.uid(),
      updated_at = now()
  where r.id = v_request.id
  returning * into v_request;

  update public.voter_password_reset_requests r
  set status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejected_at = now(),
      rejected_by = auth.uid(),
      rejection_reason = coalesce(r.rejection_reason, 'Superseded by approved reset request.'),
      updated_at = now()
  where r.voter_id = v_voter.id and r.id <> v_request.id and r.status = 'pending';

  perform public.write_audit_log(
    'password_reset_approved',
    'voter_password_reset_requests',
    v_request.id,
    jsonb_build_object('voter_id', v_voter.id, 'approved_by', auth.uid())
  );

  return query select true, v_request.id, v_request.voter_id, v_voter.email, v_request.status, true;
end $$;

create or replace function public.reject_voter_password_reset(p_request_id uuid, p_reason text)
returns table (
  success boolean,
  id uuid,
  voter_id uuid,
  status text
)
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
      rejected_at = now(),
      rejected_by = auth.uid(),
      rejection_reason = nullif(trim(coalesce(p_reason, '')), ''),
      updated_at = now()
  where r.id = p_request_id and r.status = 'pending'
  returning * into v_request;

  if v_request.id is null then raise exception 'Password reset request was not found or is not pending.'; end if;

  perform public.write_audit_log(
    'password_reset_rejected',
    'voter_password_reset_requests',
    v_request.id,
    jsonb_build_object('voter_id', v_request.voter_id, 'rejected_by', auth.uid(), 'reason', nullif(trim(coalesce(p_reason, '')), ''))
  );

  return query select true, v_request.id, v_request.voter_id, v_request.status;
end $$;

grant execute on function public.verify_voter_password(text,text) to anon, authenticated;
grant execute on function public.change_voter_password(uuid,text,text) to anon, authenticated;
grant execute on function public.approve_voter_password_reset(uuid,text) to authenticated;
grant execute on function public.reject_voter_password_reset(uuid,text) to authenticated;

notify pgrst, 'reload schema';
