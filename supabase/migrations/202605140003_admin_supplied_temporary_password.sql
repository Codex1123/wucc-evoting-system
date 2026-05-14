drop function if exists public.approve_voter_password_reset(uuid);
drop function if exists public.approve_voter_password_reset(uuid,text);

create or replace function public.approve_voter_password_reset(p_request_id uuid, p_temporary_password text)
returns table (
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
  if length(v_temp_password) < 8 then
    raise exception 'Temporary password must be at least 8 characters.';
  end if;
  if lower(v_temp_password) = lower(v_voter.matric) then
    raise exception 'Temporary password must not equal the matric number.';
  end if;
  if lower(v_temp_password) = lower(v_voter.email) then
    raise exception 'Temporary password must not equal the voter email.';
  end if;
  if lower(v_temp_password) = any(v_simple) then
    raise exception 'Temporary password is too simple.';
  end if;

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

  perform public.write_audit_log(
    'password_reset_approved',
    'voter_password_reset_requests',
    v_request.id,
    jsonb_build_object('voter_id', v_voter.id, 'reviewed_by', auth.uid())
  );

  return query select v_request.id, v_request.voter_id, v_voter.email, v_request.status, true;
end $$;

grant execute on function public.approve_voter_password_reset(uuid,text) to authenticated;
