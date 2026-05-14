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
