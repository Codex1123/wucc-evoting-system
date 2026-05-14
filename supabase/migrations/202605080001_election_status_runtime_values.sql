alter type public.election_status add value if not exists 'standby';
alter type public.election_status add value if not exists 'ended';
alter type public.election_status add value if not exists 'finalized';
alter type public.election_status add value if not exists 'inactive';
