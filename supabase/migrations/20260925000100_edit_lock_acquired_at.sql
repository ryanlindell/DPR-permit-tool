-- Phase 3B: remember when the current holder took the edit lock, so other sessions can show
-- "Being edited on another device since HH:MM". heartbeat_at cannot answer that: it moves
-- forward every 30 seconds.
alter table public.edit_locks add column acquired_at timestamptz not null default now();

-- Same atomic upsert as before; acquired_at only resets when the lock changes hands
-- (a new session wins it), not when the current holder re-acquires it.
create or replace function public.acquire_edit_lock(p_session_id uuid, p_label text, p_force boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_owner uuid := auth.uid();
begin
  if current_owner is null then return false; end if;
  insert into public.edit_locks(owner_id, session_id, holder_label, heartbeat_at, acquired_at)
  values (current_owner, p_session_id, p_label, now(), now())
  on conflict (owner_id) do update
    set session_id = excluded.session_id,
        holder_label = excluded.holder_label,
        heartbeat_at = now(),
        acquired_at = case when public.edit_locks.session_id = excluded.session_id then public.edit_locks.acquired_at else now() end
    where public.edit_locks.session_id = excluded.session_id
       or p_force
       or public.edit_locks.heartbeat_at < now() - interval '2 minutes';
  return exists(select 1 from public.edit_locks l where l.owner_id = current_owner and l.session_id = p_session_id);
end;
$$;
revoke all on function public.acquire_edit_lock(uuid, text, boolean) from public;
grant execute on function public.acquire_edit_lock(uuid, text, boolean) to authenticated;
