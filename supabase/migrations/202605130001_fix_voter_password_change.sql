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

grant execute on function public.verify_voter_password(text,text) to anon, authenticated;
grant execute on function public.change_voter_password(uuid,text,text) to anon, authenticated;
