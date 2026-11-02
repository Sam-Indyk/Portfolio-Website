-- Austin Union: online votes on past motions (src/world/union.js).
-- Visitors vote Aye or No on each motion and can change their vote; tallies are public. The tables
-- have row level security and no policies, so the API can only reach them through the two
-- functions at the bottom. Idempotent, so it is safe to run by hand in the SQL editor as well.

create table if not exists public.union_motions (
  id text primary key,
  title text not null,
  sort int not null default 0
);

create table if not exists public.union_votes (
  motion text not null references public.union_motions (id) on delete cascade,
  voter uuid not null,                 -- random id kept in the visitor's browser
  side text not null check (side in ('aye', 'no')),
  ip_hash text,                        -- salted hash, only to cap ballot stuffing from one network
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (motion, voter)
);
create index if not exists union_votes_motion_ip on public.union_votes (motion, ip_hash);

-- A private salt, so stored hashes can't be reversed by hashing every IPv4 address.
create table if not exists public.union_salt (salt text not null);
insert into public.union_salt (salt) select gen_random_uuid()::text where not exists (select 1 from public.union_salt);

alter table public.union_motions enable row level security;
alter table public.union_votes enable row level security;
alter table public.union_salt enable row level security;

-- Keep ids in step with UNION_MOTIONS in src/content.js.
insert into public.union_motions (id, title, sort) values
  ('christian-nation', 'Is America a Christian Nation?', 1),
  ('urbanization', 'Does Urbanization Promote Human Flourishing?', 2),
  ('still-a-republic', 'Is America Still a Republic?', 3),
  ('enhancement', 'Are Human Beings Meant to Enhance Themselves?', 4),
  ('political-violence', 'Is Political Violence Ever Justified?', 5)
on conflict (id) do update set title = excluded.title, sort = excluded.sort;

create or replace function public.union_tallies()
returns table (motion text, ayes bigint, noes bigint)
language sql stable security definer set search_path = '' as $$
  select m.id,
         count(v.voter) filter (where v.side = 'aye'),
         count(v.voter) filter (where v.side = 'no')
  from public.union_motions m
  left join public.union_votes v on v.motion = m.id
  group by m.id, m.sort
  order by m.sort;
$$;

create or replace function public.union_vote(p_motion text, p_voter uuid, p_side text)
returns table (ayes bigint, noes bigint)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ip text := split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  v_hash text := md5((select salt from public.union_salt limit 1) || trim(v_ip));
begin
  if p_side not in ('aye', 'no') then
    raise exception 'side must be aye or no';
  end if;
  if not exists (select 1 from public.union_motions m where m.id = p_motion) then
    raise exception 'unknown motion';
  end if;
  -- At most 40 voters per network per motion: enough for a shared campus connection, not a script.
  if not exists (select 1 from public.union_votes v where v.motion = p_motion and v.voter = p_voter)
     and (select count(*) from public.union_votes v where v.motion = p_motion and v.ip_hash = v_hash) >= 40 then
    raise exception 'too many votes from this network';
  end if;
  insert into public.union_votes as v (motion, voter, side, ip_hash)
  values (p_motion, p_voter, p_side, v_hash)
  on conflict (motion, voter) do update set side = excluded.side, updated_at = now();
  return query
    select count(*) filter (where v.side = 'aye'), count(*) filter (where v.side = 'no')
    from public.union_votes v where v.motion = p_motion;
end;
$$;

revoke all on function public.union_tallies() from public;
revoke all on function public.union_vote(text, uuid, text) from public;
grant execute on function public.union_tallies() to anon, authenticated;
grant execute on function public.union_vote(text, uuid, text) to anon, authenticated;
