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
