create or replace function public.get_shared_view(token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'fields', coalesce((select jsonb_agg(to_jsonb(f)) from public.fields f where f.owner_id = s.owner_id), '[]'::jsonb),
    'overlaps', coalesce((select jsonb_agg(to_jsonb(o)) from public.field_overlaps o where o.owner_id = s.owner_id), '[]'::jsonb),
    'permits', coalesce((select jsonb_agg(to_jsonb(p)) from public.permits p where p.owner_id = s.owner_id and p.version_id = s.active_version_id), '[]'::jsonb),
    'settings', jsonb_build_object('home_center', s.home_center, 'home_zoom', s.home_zoom),
    'version', (select to_jsonb(v) from public.versions v where v.owner_id = s.owner_id and v.id = s.active_version_id)
  )
  from public.account_settings s
  where s.share_token = token and s.share_enabled = true
  limit 1;
$$;
revoke all on function public.get_shared_view(uuid) from public;
grant execute on function public.get_shared_view(uuid) to anon, authenticated;

create or replace function public.acquire_edit_lock(p_session_id uuid, p_label text, p_force boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_owner uuid := auth.uid();
begin
  if current_owner is null then return false; end if;
  insert into public.edit_locks(owner_id, session_id, holder_label, heartbeat_at)
  values (current_owner, p_session_id, p_label, now())
  on conflict (owner_id) do update
    set session_id = excluded.session_id,
        holder_label = excluded.holder_label,
        heartbeat_at = now()
    where public.edit_locks.session_id = excluded.session_id
       or p_force
       or public.edit_locks.heartbeat_at < now() - interval '2 minutes';
  return exists(select 1 from public.edit_locks l where l.owner_id = current_owner and l.session_id = p_session_id);
end;
$$;
revoke all on function public.acquire_edit_lock(uuid, text, boolean) from public;
grant execute on function public.acquire_edit_lock(uuid, text, boolean) to authenticated;

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
  update public.account_settings set active_version_id = created.id where owner_id = current_owner;
  return created;
end;
$$;
revoke all on function public.create_version_copy(text, uuid) from public;
grant execute on function public.create_version_copy(text, uuid) to authenticated;

create or replace function public.consume_invite_code(p_code text)
returns boolean language sql security definer set search_path = '' as $$
  update public.invite_codes set uses_remaining = uses_remaining - 1
   where code = p_code and uses_remaining > 0
  returning true;
$$;
create or replace function public.restore_invite_code(p_code text)
returns void language sql security definer set search_path = '' as $$
  update public.invite_codes set uses_remaining = uses_remaining + 1 where code = p_code;
$$;
revoke all on function public.consume_invite_code(text), public.restore_invite_code(text) from public, anon, authenticated;
grant execute on function public.consume_invite_code(text), public.restore_invite_code(text) to service_role;

create or replace function public.heartbeat_edit_lock(p_session_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.edit_locks set heartbeat_at = now()
    where owner_id = auth.uid() and session_id = p_session_id;
  return found;
end;
$$;
create or replace function public.release_edit_lock(p_session_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.edit_locks where owner_id = auth.uid() and session_id = p_session_id;
$$;
revoke all on function public.heartbeat_edit_lock(uuid) from public;
revoke all on function public.release_edit_lock(uuid) from public;
grant execute on function public.heartbeat_edit_lock(uuid), public.release_edit_lock(uuid) to authenticated;
