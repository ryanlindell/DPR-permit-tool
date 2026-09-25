# Field Permit Scheduler

A permit scheduling app for Parks and Recreation staff. It maps fields, imports permit requests from Excel, identifies schedule conflicts, and supports schedule editing, named versions, and read-only share links.

## Set up Supabase

1. Create a Supabase project. In **Project Settings / API**, note the project URL and the publishable key. The publishable key is safe to use in the browser; never use a `service_role` or secret key in a `VITE_` variable.
2. In **Authentication**, turn off email confirmation. Also turn off public email signups; accounts should be created through the invite-only signup flow.
3. In **SQL Editor**, run each migration file in `supabase/migrations/` once, in filename order:
   - `20260924000100_schema_and_rls.sql`
   - `20260924000200_rpc_functions.sql`
   - `20260924000300_zoom_home_view_in.sql`
   - `20260924000400_default_home_zoom_20.sql`
   - `20260925000100_edit_lock_acquired_at.sql`
   - `20260925000200_security_hardening.sql`
   - `20260925000300_enforce_invite_signup.sql`

   If your project already has the app schema, run only migrations you have not applied yet. Do not rerun the initial table-creation migrations.
4. Deploy `signup-with-invite` from **Edge Functions**. Create a function with that exact name and paste `supabase/functions/signup-with-invite/index.ts`, or deploy it with the Supabase CLI after linking this repository. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to hosted functions. Never commit or expose the service key.
5. In **Table Editor**, open `invite_codes` and insert a row with a unique `code` and positive `uses_remaining`, such as `FIELD-STAFF-2026` and `3`. The table has no browser access; the signup function consumes codes.
6. Run the app locally or deploy it using the steps below, then choose **Create an account**. Enter a username, password of at least 8 characters, and invite code. The app maps the username to a synthetic Supabase email; these addresses cannot receive email or password-reset links.

## Run locally

1. Install Node.js 22 or newer.
2. Run `npm ci` in the repository folder.
3. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the values from your Supabase project.
4. Run `npm run dev` and open the local address printed by Vite.

## Deploy to GitHub Pages

1. Push the repository to GitHub and open **Settings / Pages**. Select **GitHub Actions** as the build and deployment source.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` under **Settings / Secrets and variables / Actions**. Repository secrets work; environment secrets also work if stored in the `github-pages` environment used by the workflow.
3. The workflow in `.github/workflows/deploy.yml` builds and deploys on pushes to `main`. Vite uses the `/DPR-permit-tool/` base path and the app uses hash routing for GitHub Pages.
4. Check the Actions run and open the Pages URL shown by the deployment job.

## How to use

This section is for the Parks and Recreation staff member running the compromise meeting.

1. **Set up the park map.** Select **Edit mode**, choose the field drawing tool, and draw each field on the satellite map. Give each field a name and type. Use **Set home view** to save the map position you want the app to open with.
2. **Load permit requests.** Choose **Download template** and send the spreadsheet to organizations. Each row is one field and time slot. When the file comes back, choose **Import permits**. The import summary reports added rows, duplicates, unmatched field names, and invalid rows.
3. **Fix unmatched field names.** If an imported field name did not match the map, open **Broken permits** and assign it to a field. You can apply the same correction to every permit with that raw field name.
4. **Review conflicts.** Select a field on the map. Conflicting requests are highlighted on the map and in the sidebar. Open the calendar to compare requests across that field and nearby overlapping fields.
5. **Make a meeting copy before editing.** Use the **Version** menu to save a new version. Switching versions changes only the version displayed in this browser; other browser sessions keep their own selection. New sessions and public share links use the account's default version. Select **Edit mode** before changing fields or permits. Permit edit locks are per version, so two sessions can edit different versions at the same time. Field shapes and names are shared across all versions, so field edits affect every version and should not be made simultaneously.
6. **Share the schedule.** In **Settings**, enable the share link and copy it. Anyone with the link can see the current schedule but cannot edit it. Open the link on the meeting projector; it refreshes about every 15 seconds. Regenerating the link invalidates the old one.
7. **Finish.** Sign out when done. Export is currently a placeholder; it does not create a file yet.

For a projector, open the share link full screen at 1280 x 720 or larger. The share page uses larger text and hides editing controls.

## Password resets

Usernames are mapped to synthetic email addresses ending in `@users.fieldpermits.invalid`, so users cannot receive password-reset email. An administrator must reset a password in **Supabase Dashboard / Authentication / Users**.

## Account data isolation

The migrations enable RLS on every account table. Each authenticated policy limits rows to the signed-in user's `auth.uid()`; anonymous clients have no table privileges after the security-hardening migration. `invite_codes` has no browser privileges. The auth-user trigger requires a server-written `invite_signup` marker that only the invite Edge Function supplies, providing a database-level barrier even if the public-signup Dashboard option is accidentally enabled. Keep public email signups disabled as an additional protection. Anonymous schedule sharing is limited to `get_shared_view(token)`, which returns the active schedule only when the matching account has sharing enabled.

To verify isolation in a configured project, create two accounts and sign in to each in separate browser profiles. In each session, inspect `profiles`, `account_settings`, `fields`, `field_overlaps`, `versions`, `permits`, and `edit_locks`: each should show only that account's rows. Try reading `invite_codes` from either browser session; it should be denied. An anonymous request to an account table should be denied, while a valid enabled share link should return only its owner's shared schedule. The repository does not contain credentials for the live Supabase project, so these live account tests must be run in the configured project.

With `.env.local` configured, the latest migrations applied, and the signup function deployed, `npm run security:public` checks the public-signup setting, makes anonymous checks against the project's table endpoints, tests a random unknown share token, and submits a signup request with a blank invite code. It prints only pass/fail information and never prints returned row contents or keys. It does not create accounts or consume invite codes. This smoke check does not replace the two-account ownership test above.

## Add a permit attribute

Add a `PermitAttribute` to the ordered array in `src/config/permitSchema.ts`. Give it a unique `key`, user-facing `label`, type, optional select options, and the `required`, `showInSidebar`, and `editable` flags. Extra values are stored in `permits.extra`; no database migration is needed.

## Checks

- `npm test` runs the Vitest suite.
- `npm run build` type-checks and creates the production build.
- `npm run lint` runs ESLint.
