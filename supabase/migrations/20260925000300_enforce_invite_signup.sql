-- Phase 4: fail closed if a user is inserted into auth.users outside the invite
-- Edge Function. GoTrue clients can submit user_metadata, but app_metadata is
-- server-managed; signup-with-invite sets this marker after consuming a code.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare new_version_id uuid;
begin
  if coalesce(new.raw_app_meta_data ->> 'invite_signup', 'false') <> 'true' then
    raise exception 'Account creation requires a valid invite.' using errcode = '42501';
  end if;

  insert into public.profiles(id, username)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)));
  insert into public.versions(owner_id, name)
    values (new.id, 'Original')
    returning id into new_version_id;
  insert into public.account_settings(owner_id, active_version_id)
    values (new.id, new_version_id);
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
