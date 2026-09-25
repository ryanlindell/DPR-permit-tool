-- New accounts start two zoom levels closer than the previous default.
alter table public.account_settings
  alter column home_zoom set default 20;
