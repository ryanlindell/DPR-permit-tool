# Phase 4 requirements checklist

Status describes the repository implementation. Live Supabase and browser-only checks are called out separately; a code review is not presented as a runtime test.

| SPEC | Status | Evidence and notes |
|---|---|---|
| 1. Purpose: map fields, import permits, show conflicts, edit schedules, versions, and sharing | Met | Map, import, broken permits, sidebar, calendar, version menu, and read-only share route are implemented. |
| 2. Stack: Vite, React, TypeScript, HashRouter, GitHub Pages, Supabase, Leaflet/Geoman, Turf, FullCalendar, ExcelJS | Met | Dependencies and routing are present; `.github/workflows/deploy.yml` now runs lint, tests, and build before deployment. |
| 2. Secret handling | Met | Browser configuration uses only the publishable key; no service-role key is referenced by frontend configuration. |
| 3.1. Username/password accounts and invite-only signup | Partial until the latest migration and Edge Function are deployed and public signup is disabled | The live Supabase Auth settings currently report public signup enabled. Added a database trigger guard requiring a server-written invite marker and added the marker to the Edge Function, but those code changes still need deployment. The Dashboard public-signup setting must also be turned off. |
| 3.2. Tables, indexes, constraints, default account settings/version | Met | Schema migrations define account tables, ownership constraints, indexes, and the new-user trigger. |
| 3.3. RLS and invite table isolation | Partial: anonymous table checks passed; live signup setting and authenticated A/B test remain | Owner policies cover each account table; the hardening migration explicitly revokes anonymous table access. Live requests returned no anonymous rows for the eight tables and denied `invite_codes`. The current Auth settings endpoint reports public signup enabled. Two authenticated accounts were not available for a live cross-owner read/write test. |
| 3.3. Read-only share RPC | Met for reviewed behavior; cross-account data test remains | `get_shared_view` is `SECURITY DEFINER`, has an empty search path, matches the UUID token and enabled flag, and returns only the active version. Anonymous call with an unknown token returned `null`. |
| 3.4. Configurable permit attributes and field types | Met | `permitSchema` drives template, parser, sidebar, and permit editing; extras use `permits.extra`. |
| 4.1. Strict time overlap and back-to-back behavior | Met | Pure logic and tests cover strict boundaries. |
| 4.2. Positive-area field overlap cache and recovery action | Met | Geometry changes recalculate affected pairs; Settings now has **Recompute all overlaps** and reports progress, completion, and failures. |
| 4.3. Permit conflict logic | Met | Conflict calculation uses same-version permits, field adjacency, shared days, and strict time overlap; tests cover edge cases. |
| 4.4–4.5. Import de-duplication and field matching | Met | Normalized identity and field names are covered by tests; unmatched permits retain their raw field name. |
| 5.1. Map, drawing, editing, delete, saved home view, conflict styling | Met | Leaflet/Geoman tools, persistence callbacks, home view, and color plus dashed conflict emphasis are present. |
| 5.2. Excel template/import validation and summary | Met | Template includes an Instructions sheet and a two-slot example; imports report duplicates, broken names, invalid rows, and out-of-hours requests. |
| 5.3. Broken permit assignment and apply-to-all | Met | Broken permits dialog supports single and repeated-name assignment. |
| 5.4. Sidebar grouping, conflicts, editing, calendar navigation | Met | Sidebar groups by organization, displays configured extras, and supports permit changes and deletion. |
| 5.5. Weekly calendar and event editing | Met | Calendar shows selected and overlapping fields, day occurrences, details/conflicts, drag edits, and a Back action. |
| 5.6. Edit controls and edit locks | Met in implementation; multi-session behavior not live-tested | Lock acquisition is atomic per version, uses a 30-second heartbeat and two-minute stale period, and includes takeover and displaced-session handling. Fields remain shared across versions. |
| 5.7. Named schedule versions | Met | Display selection is per browser session; save as, switch, rename, delete, and default/share-version protections are implemented. |
| 5.8. Share link and projector presentation mode | Partial: code reviewed; visual projector test remains | Settings, token replacement, read-only map/sidebar/calendar, refresh, and larger share-route type are implemented. A browser was unavailable in this session, so the 1280×720 rendering was not visually measured. |
| 5.9. Export placeholder and registry | Met | Export opens the placeholder dialog; `src/export/` defines the exporter contract and registry. |
| 6.1. Laptop/projector sizing and accessible conflict cue | Partial: CSS reviewed; projector visual test remains | Layout has responsive rules and non-color conflict outlines. Projector fit at 1280×720 still needs a browser screenshot. |
| 6.2. Loading states and human-readable network errors | Met in reviewed paths | Initial session failures now show retry UI; auth, import, version, share, lock, field, and permit actions expose errors. Version permit-count failures are no longer silently swallowed. Best-effort lock release remains intentionally non-blocking. |
| 6.3. Edit-lock timing and takeover behavior | Met in code; multi-session timing not live-tested | SQL and client implement owner-scoped lock acquisition, heartbeat, release, takeover, and acquired-time display. |
| 6.4. Data-layer boundaries | Met | Auth calls now live in `src/data/auth.ts`; components use data-layer functions rather than calling Supabase Auth directly. |
| 6.5. README setup and help for nontechnical staff | Met | README includes Supabase setup, migrations, invite creation, local run, Pages secrets/deploy, password reset, account isolation checks, attribute extension, and a short How to use guide. |

## Phase 4 security review

- Reviewed every table policy, every `SECURITY DEFINER` function, the invoker version-copy function, and the signup Edge Function.
- Added `20260925000200_security_hardening.sql`: account tables have no anonymous table privileges; `invite_codes` remains inaccessible to browser roles; function execution is granted only to the intended roles.
- The live project currently has public Auth signup enabled, which is a direct invite bypass until fixed. Added `20260925000300_enforce_invite_signup.sql` to reject auth-user inserts without a server-written marker and changed the Edge Function to set that marker. Apply the migration and redeploy the function, then disable public email signup in the Supabase Dashboard.
- Confirmed reviewed definer functions use `search_path = ''` and schema-qualified table references. User-scoped functions bind ownership to `auth.uid()`; version/permit/field relationships also use owner-scoped foreign keys.
- Hardened signup request parsing and configuration checks. Invalid invite requests return client errors; server-side failures return a generic message instead of exposing Supabase Auth error details. Invite consumption is restored after user creation fails.
- Live anonymous checks returned no rows from any of the eight table endpoints; `invite_codes` returned 401; unknown share token returned `null`; blank-invite signup returned 400 before invite consumption. The same run found `disable_signup` is currently false, so the invite-only deployment check failed and requires the steps above. The check suppresses returned data and does not create accounts or consume codes.
- The live test does not substitute for a two-account authenticated read/write test. Use the steps in README after preparing two test accounts.

## Verification run

- `npm run lint` — passed.
- `npm test` — passed, 17 test files and 142 tests.
- `npm run build` — passed; Vite reports the existing large JavaScript chunk advisory.
- `npm run security:public` — anonymous table, unknown share token, and blank invite checks passed; command correctly failed because public Auth signup is enabled in the live project.
- Browser screenshot at exactly 1280×720 — not run; no browser was available to this session.
