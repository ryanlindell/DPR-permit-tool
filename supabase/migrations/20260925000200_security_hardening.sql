-- Phase 4: make the public-schema privilege boundary explicit in addition to RLS.
-- RLS protects row ownership for authenticated users; anonymous clients should not
-- have table privileges at all. The only public read path is get_shared_view(token).
revoke all on table
  public.profiles,
  public.account_settings,
  public.fields,
  public.field_overlaps,
  public.versions,
  public.permits,
  public.edit_locks,
  public.invite_codes
from anon;

-- Keep invite codes inaccessible to every browser role, even if a broad grant was
-- added outside this migration set.
revoke all on table public.invite_codes from authenticated;

-- Remove default PUBLIC execution and grant each function only to its intended caller.
revoke all on function public.handle_new_user() from public, anon, authenticated;

revoke all on function public.get_shared_view(uuid) from public, anon, authenticated;
grant execute on function public.get_shared_view(uuid) to anon, authenticated;

revoke all on function public.acquire_edit_lock(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.acquire_edit_lock(uuid, text, boolean) to authenticated;

revoke all on function public.heartbeat_edit_lock(uuid) from public, anon, authenticated;
revoke all on function public.release_edit_lock(uuid) from public, anon, authenticated;
grant execute on function public.heartbeat_edit_lock(uuid), public.release_edit_lock(uuid) to authenticated;

revoke all on function public.create_version_copy(text, uuid) from public, anon, authenticated;
grant execute on function public.create_version_copy(text, uuid) to authenticated;

revoke all on function public.consume_invite_code(text), public.restore_invite_code(text)
  from public, anon, authenticated;
grant execute on function public.consume_invite_code(text), public.restore_invite_code(text) to service_role;
