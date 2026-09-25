# Field Permit Scheduler

A small permit scheduling app for a parks department. The first release provides invite-only username/password accounts and a map workspace shell. The map, importer, calendar, and sharing UI are developed in later phases.

## Local development

1. Install Node.js 22 or newer.
2. Run `npm ci`.
3. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the Supabase project Connect panel or API Keys settings. The publishable key is intended for browser use; never put a secret/service-role key in a `VITE_` variable.
4. Apply the SQL files in `supabase/migrations/` in filename order using the Supabase SQL Editor. The CLI alternative requires initializing and linking a Supabase CLI project first.
5. Deploy `signup-with-invite` from **Edge Functions → Deploy a new function → Via Editor**, pasting `supabase/functions/signup-with-invite/index.ts`, or initialize/link the CLI project and deploy with `supabase functions deploy signup-with-invite`. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to hosted functions; do not add custom secrets with the reserved `SUPABASE_` prefix or expose the service key in frontend code.
6. Start Vite with `npm run dev`, then open the local URL it prints.

## Supabase project setup

1. Create a Supabase project and save its URL and publishable key. The Edge Function's privileged key is provided by Supabase at runtime and must never be put in frontend code.
2. In **Authentication → Providers → Email**, disable **Confirm email**. Accounts use synthetic email addresses and cannot receive reset messages.
3. In **Authentication → Settings**, disable public email signups. Users are created only by the invite Edge Function using the server-side admin API.
4. In **SQL Editor**, run the files in `supabase/migrations/` in filename order: `20260924000100_schema_and_rls.sql`, `20260924000200_rpc_functions.sql`, `20260924000300_zoom_home_view_in.sql`, then `20260924000400_default_home_zoom_20.sql`. Run each whole file once and wait for the success result before continuing.
5. Deploy `signup-with-invite` from **Edge Functions → Deploy a new function → Via Editor**. Name it exactly `signup-with-invite` and paste the contents of `supabase/functions/signup-with-invite/index.ts`. Supabase injects the function's `SUPABASE_URL` and legacy `SUPABASE_SERVICE_ROLE_KEY` environment values. Keep the service key out of the repo and browser. The Dashboard editor is intended for quick setup; keep the source of truth in this repository.
6. Create an invite code in **Table Editor → invite_codes → Insert row**. Enter a unique `code` and positive `uses_remaining`, for example `FIELD-STAFF-2026` and `3`. This table has RLS enabled and no client policies; only the Edge Function can consume codes.
7. Open the app, choose **Create an account**, and enter a username, password (at least 8 characters), and invite code. After the success message, sign in with that username and password. The app maps the username internally to `<lowercase-username>@users.fieldpermits.invalid`.
8. A new account gets its profile, settings, and an `Original` schedule version from the auth-user trigger.

### Confirm account data isolation

The migrations enable RLS on every account table and grant authenticated access only through owner-scoped policies comparing `owner_id` (or the profile `id`) with `auth.uid()`. `invite_codes` has no client policy. Anonymous clients cannot query account tables; anonymous share data is only returned by the restricted `get_shared_view(token)` function when sharing is enabled.

After creating two accounts, sign into each in a separate browser profile. In each session, use the Supabase client/API with that account's session token to select from `profiles`, `account_settings`, `fields`, `field_overlaps`, `versions`, `permits`, and `edit_locks`. Each account should see only its own rows; account A attempting to insert or update a row with account B's `owner_id` should get an RLS error. An unauthenticated request should see no rows, and direct reads of `invite_codes` should be denied. This repository does not include project credentials, so live two-account RLS verification must be performed after you create the Supabase project using these steps.

## Password resets

Synthetic addresses cannot receive email. An administrator must reset a user's password in **Supabase Dashboard → Authentication → Users** using the dashboard's password update/reset controls.

## GitHub Pages deployment

1. Push the repository to GitHub and open **Settings → Pages**. Set the build and deployment source to **GitHub Actions**.
2. Under **Settings → Secrets and variables → Actions**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as repository or environment secrets.
3. The workflow at `.github/workflows/deploy.yml` builds on pushes to `main` and deploys `dist`. Vite uses `/DPR-permit-tool/` as the base path and the app uses `HashRouter`, so refresh/deep route navigation works on Pages.
4. Check the workflow run and the Pages URL shown in its deployment job.

## Adding a permit attribute

Add a `PermitAttribute` entry to the ordered array in `src/config/permitSchema.ts` with a unique `key`, user-facing `label`, `type`, optional `options`, and the `required`, `showInSidebar`, and `editable` flags. Extra attributes are stored in the existing `permits.extra` JSONB column, so no schema migration is needed. The template, importer, and editing UI phases should render configured entries from this array.

## Scripts

- `npm run dev` — local Vite server
- `npm test` — Vitest unit tests
- `npm run build` — type-check and production build
- `npm run lint` — ESLint
