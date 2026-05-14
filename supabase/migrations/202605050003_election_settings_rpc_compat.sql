create or replace function public.update_current_election_settings(
  p_title text,
  p_status public.election_status default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_election_id uuid;
begin
  if not public.is_election_admin() then
    raise exception 'Only superadmins and commissioners can update election settings.';
  end if;

  if nullif(trim(p_title), '') is null then
    raise exception 'Election title is required.';
  end if;

  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'Election end date must be after start date.';
  end if;

  select id into v_election_id
  from public.elections
  order by created_at desc
  limit 1;

  if v_election_id is null then
    insert into public.elections(title,status,starts_at,ends_at)
    values (trim(p_title), coalesce(p_status, 'inactive'), p_starts_at, p_ends_at);
    return;
  end if;

  update public.elections
  set title = trim(p_title),
      status = coalesce(p_status, status),
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      updated_at = now()
  where id = v_election_id;
end;
$$;

create or replace function public.udate_current_election_settings(
  p_title text,
  p_status public.election_status default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
)
returns void
language sql
security definer
set search_path = public
as $$
  select public.update_current_election_settings(p_title,p_status,p_starts_at,p_ends_at)
$$;

grant execute on function public.update_current_election_settings(text,public.election_status,timestamptz,timestamptz) to authenticated;
grant execute on function public.udate_current_election_settings(text,public.election_status,timestamptz,timestamptz) to authenticated;
