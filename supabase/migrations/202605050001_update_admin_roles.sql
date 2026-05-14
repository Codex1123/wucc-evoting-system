alter type public.user_role add value if not exists 'commissioner';
alter type public.user_role add value if not exists 'voter';

alter table public.profiles
  alter column role set default 'voter';

create or replace function public.is_election_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role()::text in ('superadmin','commissioner','commission'), false)
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
