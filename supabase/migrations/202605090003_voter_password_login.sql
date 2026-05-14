create extension if not exists pgcrypto;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

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

alter table public.voters
  add column if not exists password_hash text,
  add column if not exists password_changed_at timestamptz;

update public.voters
set password_hash = public.pgcrypto_crypt(upper(matric), public.pgcrypto_gen_salt('md5')),
    password_changed_at = null,
    updated_at = now()
where password_hash is null;

create or replace function public.ensure_voter_default_password()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.password_hash is null then
    new.password_hash := public.pgcrypto_crypt(upper(new.matric), public.pgcrypto_gen_salt('md5'));
    new.password_changed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists voters_default_password on public.voters;
create trigger voters_default_password before insert on public.voters for each row execute function public.ensure_voter_default_password();

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
  from public.voters
  where id = p_voter_id;

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

  update public.voters
  set password_hash = public.pgcrypto_crypt(p_new_password, public.pgcrypto_gen_salt('md5')),
      password_changed_at = now(),
      updated_at = now()
  where id = p_voter_id
  returning * into v_row;

  return query
  select v_row.id, v_row.full_name, v_row.matric, v_row.department, v_row.level, v_row.email, v_row.status::text, v_row.has_voted, false;
end $$;

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
  if nullif(trim(p_email), '') is null then raise exception 'Email address is required.'; end if;

  if exists (select 1 from public.voters v where upper(v.matric) = v_matric) then
    raise exception 'A voter with this matric number already exists.';
  end if;
  if exists (select 1 from public.voters v where lower(v.email) = v_email) then
    raise exception 'A voter with this email address already exists.';
  end if;

  insert into public.voters (full_name, matric, department, level, email, auth_user_id, password_hash, status)
  values (trim(p_full_name), v_matric, trim(p_department), trim(p_level), v_email, p_auth_user_id, public.pgcrypto_crypt(v_matric, public.pgcrypto_gen_salt('md5')), 'pending')
  returning public.voters.id into v_id;

  return query
  select v.id, v.full_name, v.matric, v.department, v.level, v.email, v.status::text, v.has_voted
  from public.voters v
  where v.id = v_id;
end $$;

grant execute on function public.verify_voter_password(text,text) to anon, authenticated;
grant execute on function public.change_voter_password(uuid,text,text) to anon, authenticated;
grant execute on function public.register_voter(text,text,text,text,text,uuid) to anon, authenticated;
