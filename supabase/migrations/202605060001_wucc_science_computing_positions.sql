with election as (
  select id from public.elections order by created_at desc limit 1
),
canonical(slug, title, icon, display_order) as (
  values
    ('governor','Governor','shield',1),
    ('deputy-governor','Deputy Governor','medal',2),
    ('gsec','General Secretary','clipboard',3),
    ('agsec','Assistant General Secretary','file-text',4),
    ('fsec','Financial Secretary','wallet',5),
    ('pro','Public Relation Officer','megaphone',6),
    ('dwelfare','Director of Welfare','heart-handshake',7),
    ('dhealth','Director of Health','cross',8),
    ('dsport','Director of Sport','trophy',9),
    ('dsocials','Director of Socials','sparkles',10)
)
insert into public.positions (election_id, slug, title, icon, display_order, is_active)
select election.id, canonical.slug, canonical.title, canonical.icon, canonical.display_order, true
from election
cross join canonical
on conflict (election_id, slug)
do update set
  title = excluded.title,
  icon = excluded.icon,
  display_order = excluded.display_order,
  is_active = true;

with election as (
  select id from public.elections order by created_at desc limit 1
),
canonical(slug) as (
  values
    ('governor'),
    ('deputy-governor'),
    ('gsec'),
    ('agsec'),
    ('fsec'),
    ('pro'),
    ('dwelfare'),
    ('dhealth'),
    ('dsport'),
    ('dsocials')
)
update public.positions
set is_active = false
where election_id = (select id from election)
  and slug not in (select slug from canonical);
