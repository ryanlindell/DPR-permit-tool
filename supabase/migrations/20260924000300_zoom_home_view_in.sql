-- Move saved home views two zoom levels closer. Cap at the map's maximum zoom.
alter table public.account_settings
  alter column home_zoom set default 18;

update public.account_settings
set home_zoom = least(home_zoom + 2, 24);
