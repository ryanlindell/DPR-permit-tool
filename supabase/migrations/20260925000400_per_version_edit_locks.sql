-- Viewing a version is a per-browser choice. Permit editing locks are scoped to
-- a version so independent schedules can be edited at the same time.
alter table public.edit_locks add column version_id uuid;

update public.edit_locks l
set version_id = s.active_version_id
from public.account_settings s
where s.owner_id = l.owner_id;

-- Every existing account has an Original version and account_settings row. Keep
-- a safe fallback for any legacy orphan lock before enforcing the new key.
update public.edit_locks l
set version_id = v.id
from public.versions v
where l.version_id is null and v.owner_id = l.owner_id
  and v.name = 'Original';

delete from public.edit_locks where version_id is null;
alter table public.edit_locks alter column version_id set not null;
alter table public.edit_locks drop constraint edit_locks_pkey;
alter table public.edit_locks add primary key (owner_id, version_id);
alter table public.edit_locks add constraint edit_locks_owner_version_fkey
  foreign key (owner_id, version_id) references public.versions(owner_id, id) on delete cascade;

drop function public.acquire_edit_lock(uuid, text, boolean);
drop function public.heartbeat_edit_lock(uuid);
drop function public.release_edit_lock(uuid);

create or replace function public.acquire_edit_lock(
  p_session_id uuid,
  p_version_id uuid,
  p_label text,
  p_force boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_owner uuid := auth.uid();
begin
  if current_owner is null then return false; end if;
  if not exists (
    select 1 from public.versions v
    where v.owner_id = current_owner and v.id = p_version_id
  ) then return false; end if;

  insert into public.edit_locks(owner_id, version_id, session_id, holder_label, heartbeat_at, acquired_at)
  values (current_owner, p_version_id, p_session_id, p_label, now(), now())
  on conflict (owner_id, version_id) do update
    set session_id = excluded.session_id,
        holder_label = excluded.holder_label,
        heartbeat_at = now(),
        acquired_at = case when public.edit_locks.session_id = excluded.session_id then public.edit_locks.acquired_at else now() end
    where public.edit_locks.session_id = excluded.session_id
       or p_force
       or public.edit_locks.heartbeat_at < now() - interval '2 minutes';
  return exists(
    select 1 from public.edit_locks l
    where l.owner_id = current_owner and l.version_id = p_version_id and l.session_id = p_session_id
  );
end;
$$;

create or replace function public.heartbeat_edit_lock(p_session_id uuid, p_version_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.edit_locks set heartbeat_at = now()
  where owner_id = auth.uid() and version_id = p_version_id and session_id = p_session_id;
  return found;
end;
$$;

create or replace function public.release_edit_lock(p_session_id uuid, p_version_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.edit_locks
  where owner_id = auth.uid() and version_id = p_version_id and session_id = p_session_id;
$$;

revoke all on function public.acquire_edit_lock(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.acquire_edit_lock(uuid, uuid, text, boolean) to authenticated;
revoke all on function public.heartbeat_edit_lock(uuid, uuid), public.release_edit_lock(uuid, uuid) from public, anon, authenticated;
grant execute on function public.heartbeat_edit_lock(uuid, uuid), public.release_edit_lock(uuid, uuid) to authenticated;

-- Creating a copy should select it only in the caller's browser. The account's
-- active_version_id remains the default version used by share links and new sessions.
create or replace function public.create_version_copy(p_name text, p_source_version_id uuid)
returns public.versions
language plpgsql security invoker set search_path = '' as $$
declare current_owner uuid := auth.uid(); created public.versions;
begin
  if current_owner is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.versions where owner_id = current_owner and id = p_source_version_id) then raise exception 'Source version not found'; end if;
  insert into public.versions(owner_id, name) values (current_owner, trim(p_name)) returning * into created;
  insert into public.permits(owner_id, version_id, organization, field_id, raw_field_name, start_time, end_time, days, notes, extra, import_batch_id)
    select owner_id, created.id, organization, field_id, raw_field_name, start_time, end_time, days, notes, extra, import_batch_id
    from public.permits where owner_id = current_owner and version_id = p_source_version_id;
  return created;
end;
$$;
revoke all on function public.create_version_copy(text, uuid) from public, anon;
grant execute on function public.create_version_copy(text, uuid) to authenticated;
