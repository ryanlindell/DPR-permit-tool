create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now()
);

create table public.invite_codes (
  code text primary key,
  uses_remaining integer not null check (uses_remaining >= 0),
  created_at timestamptz not null default now()
);

create table public.versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (owner_id, id)
);
create unique index versions_owner_lower_name_idx on public.versions(owner_id, lower(name));

create table public.account_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  home_center jsonb not null default '{"lat":21.395,"lng":-157.7388}'::jsonb check (jsonb_typeof(home_center) = 'object'),
  home_zoom integer not null default 16 check (home_zoom between 0 and 24),
  active_version_id uuid not null,
  share_enabled boolean not null default false,
  share_token uuid not null default gen_random_uuid(),
  unique (share_token),
  foreign key (owner_id, active_version_id) references public.versions(owner_id, id) on delete restrict
);

create table public.fields (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  field_type text not null default 'Other',
  geometry jsonb not null check (geometry->>'type' = 'Polygon'),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id)
);
create unique index fields_owner_lower_name_idx on public.fields(owner_id, lower(name));

create table public.field_overlaps (
  owner_id uuid not null references auth.users(id) on delete cascade,
  field_a uuid not null,
  field_b uuid not null,
  primary key (owner_id, field_a, field_b),
  check (field_a < field_b),
  foreign key (owner_id, field_a) references public.fields(owner_id, id) on delete cascade,
  foreign key (owner_id, field_b) references public.fields(owner_id, id) on delete cascade
);
create index field_overlaps_b_idx on public.field_overlaps(owner_id, field_b);

create table public.permits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  version_id uuid not null,
  organization text not null check (length(trim(organization)) > 0),
  field_id uuid,
  raw_field_name text not null default '',
  start_time time not null,
  end_time time not null,
  days smallint[] not null check (cardinality(days) > 0 and days <@ array[0,1,2,3,4,5,6]::smallint[]),
  notes text not null default '',
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  import_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time),
  foreign key (owner_id, version_id) references public.versions(owner_id, id) on delete cascade,
  foreign key (owner_id, field_id) references public.fields(owner_id, id) on delete set null (field_id)
);
create index permits_owner_version_idx on public.permits(owner_id, version_id);
create index permits_owner_field_idx on public.permits(owner_id, field_id);

create table public.edit_locks (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  session_id uuid not null,
  holder_label text not null,
  heartbeat_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare new_version_id uuid;
begin
  insert into public.profiles(id, username)
    values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  insert into public.versions(owner_id, name) values (new.id, 'Original') returning id into new_version_id;
  insert into public.account_settings(owner_id, active_version_id) values (new.id, new_version_id);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.invite_codes enable row level security;
alter table public.account_settings enable row level security;
alter table public.fields enable row level security;
alter table public.field_overlaps enable row level security;
alter table public.versions enable row level security;
alter table public.permits enable row level security;
alter table public.edit_locks enable row level security;
revoke all on public.invite_codes from anon, authenticated;

create policy profiles_owner_all on public.profiles for all to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy account_settings_owner_all on public.account_settings for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy fields_owner_all on public.fields for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy field_overlaps_owner_all on public.field_overlaps for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy versions_owner_all on public.versions for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy permits_owner_all on public.permits for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy edit_locks_owner_all on public.edit_locks for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
-- invite_codes intentionally has no client policies.

grant select, insert, update, delete on public.profiles, public.account_settings, public.fields, public.field_overlaps, public.versions, public.permits, public.edit_locks to authenticated;
