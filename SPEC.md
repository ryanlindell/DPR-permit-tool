# Field Permit Scheduler: Project Specification

This file is the single source of truth for the project. Every Claude Code session must read it before doing anything. If an implementation decision is not covered here, stop and ask rather than guess. If a decision in this file turns out to be wrong or impractical, say so and propose a change to this file instead of silently deviating.

## 1. Purpose

A Parks and Recreation department receives field-use permits from sports organizations during a two-week filing window. Afterward, staff hold a compromise meeting (and a week of follow-up) to resolve conflicts where organizations want the same space at the same time. This tool lets a staff member:

1. Draw the park's fields as polygons on a satellite map (fields may physically overlap).
2. Import permits from an Excel file.
3. See, per field, which permits exist and which conflict, in a sidebar and a weekly calendar.
4. Edit permits (time, days, field, delete) during the compromise process.
5. Keep multiple named versions ("saves") of the permit schedule.
6. Share a read-only view by link, used for projecting during the meeting and for permit holders.

Primary users: the staff member's boss (account owner/editor), supervisors and permit holders (viewers via link). Scale is tiny: a handful of accounts, one park each, tens to low hundreds of permits.

## 2. Tech stack (fixed)

- **Frontend:** Vite + React + TypeScript, deployed to GitHub Pages via a GitHub Actions workflow.
- **Routing:** `HashRouter` (GitHub Pages cannot serve SPA deep links). Routes: `#/login`, `#/signup`, `#/` (main app), `#/share/:token` (read-only view).
- **Map:** Leaflet via `react-leaflet`, polygon drawing and editing with `@geoman-io/leaflet-geoman-free`. Satellite basemap: Esri World Imagery (with required attribution).
- **Geometry:** `@turf/turf` for polygon intersection.
- **Calendar:** FullCalendar (`@fullcalendar/react`, `timegrid`, `interaction`; MIT-licensed packages only, no premium plugins).
- **Excel:** `exceljs` for both generating the template (it supports data-validation dropdowns) and parsing uploads.
- **Backend:** Supabase (Postgres, Auth, Row Level Security, one Edge Function for signup).
- **Tests:** Vitest for all pure logic modules.
- **Secrets:** Supabase URL and publishable key are injected at build time via GitHub Actions secrets as `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The publishable key is public by design; all protection comes from RLS. The secret/service-role key must never appear in frontend code or the repo.

## 3. Core concepts and data model

### 3.1 Accounts
- One login = one account = one park. Two people may share a login.
- Login is **username + password**. Supabase Auth requires email format, so the app maps a username to a synthetic email internally (`<username>@users.fieldpermits.invalid`) with email confirmation disabled. Consequence: no self-service password reset; the admin resets passwords from the Supabase dashboard. Document this in the README.
- **Signup requires an invite code.** Public signups are disabled in Supabase. The signup page calls a Supabase Edge Function `signup-with-invite` that validates the code against the `invite_codes` table, decrements its uses, and creates the user with the admin API. The admin creates invite codes by inserting rows in the Supabase dashboard.

### 3.2 Tables (all have `owner_id uuid references auth.users` unless noted)

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `id` (= auth uid), `username`, `created_at` | |
| `invite_codes` | `code` (pk), `uses_remaining int`, `created_at` | No client access at all; only the Edge Function reads it. |
| `account_settings` | `owner_id` (pk), `home_center` (lat/lng), `home_zoom`, `active_version_id`, `share_enabled bool`, `share_token uuid` | Created on signup along with a default version named "Original". |
| `fields` | `id`, `name`, `field_type`, `geometry jsonb` (GeoJSON Polygon), `notes`, timestamps | Unique `(owner_id, lower(name))`. Fields are physical and shared across all versions. |
| `field_overlaps` | `owner_id`, `field_a`, `field_b` | Cached adjacency, stored with `field_a < field_b`. See 4.2. |
| `versions` | `id`, `name`, `created_at` | Named saves of the permit schedule. |
| `permits` | `id`, `version_id`, `organization`, `field_id` (nullable), `raw_field_name`, `start_time time`, `end_time time`, `days smallint[]`, `notes`, `extra jsonb`, `import_batch_id`, timestamps | `field_id` null = broken permit. Days use 0=Sun ... 6=Sat. |
| `edit_locks` | `owner_id` (pk), `session_id`, `holder_label`, `heartbeat_at` | See 6.3. |

**Times are wall-clock values (`time`, "HH:MM"), never timestamps.** A permit is a weekly recurring slot, not an event on a date, so storing timezone-aware timestamps would only introduce bugs.

### 3.3 Row Level Security
- Every table except `invite_codes` has RLS enabled with policies: authenticated users can select/insert/update/delete only rows where `owner_id = auth.uid()`.
- `invite_codes` has RLS enabled and **no policies** (fully inaccessible to clients).
- Anonymous share viewers never read tables directly. They call a `security definer` Postgres function `get_shared_view(token uuid)` that returns the fields, overlaps, and permits of the active version for the account whose `share_token` matches and whose `share_enabled` is true, or nothing otherwise.

### 3.4 Extensible permit attributes
Adding a new permit attribute must be a config change, not a refactor. `src/config/permitSchema.ts` exports an ordered array of attribute definitions:

```ts
type PermitAttribute = {
  key: string;              // e.g. "contactName"
  label: string;            // shown in UI and as the Excel column header
  type: "text" | "longtext" | "number" | "select";
  options?: string[];       // for "select"
  required: boolean;
  showInSidebar: boolean;
  editable: boolean;
};
```

Core attributes (organization, field, start/end time, days, notes) have dedicated columns. Any attribute defined in the config beyond those is stored in `permits.extra` (jsonb), so adding one requires no database migration. The Excel template generator, the importer, the sidebar, and the edit form all render from this config. Field types (Soccer, Football, Baseball, Softball, Multi-purpose, Other) live in `src/config/fieldTypes.ts`.

## 4. Core logic (pure functions in `src/logic/`, fully unit tested)

### 4.1 Time overlap
Two time ranges overlap iff `startA < endB && startB < endA` (strict: 5:00-6:00 and 6:00-7:00 do not overlap).

### 4.2 Field overlap (cached)
Two fields overlap iff their polygons intersect with **positive area** (area above ~1 m², so fields drawn sharing an edge do not count). Computed with turf when a field is created, its geometry is edited, or it is deleted; only pairs involving the changed field are recomputed; results are written to `field_overlaps`. Page loads read the cache and never recompute. Provide a "Recompute all overlaps" action in settings as a safety valve.

### 4.3 Permit conflict
Permits P and Q (same version) conflict iff all hold:
1. Space: same `field_id`, or their fields are in `field_overlaps`.
2. Weekday: their `days` arrays share at least one day.
3. Time: their time ranges overlap per 4.1.

Broken permits (null `field_id`) never conflict. No changeover buffer: back-to-back permits (one ends at 6:00, the next starts at 6:00) never conflict.

A permit has exactly one time slot. Conflict checks must never merge a permit's days and times across multiple permits (e.g. by organization), because that creates false conflicts. Required test case: Org 1 has Field 1 Mon 5:00-6:00 and Field 1 Tue 6:00-7:00 (two permits); Org 2 has Field 1 Tue 5:00-6:00. Expected result: no conflicts. `computeConflicts(permits, overlaps)` returns, per permit, the list of conflicting permits with the shared days, so the UI can say "Conflicts with Kailua Youth Soccer on Field B, Tue/Thu 5:00-6:00 PM".

### 4.4 Import de-duplication
A permit's identity key is the normalized tuple `(organization, raw field name, start, end, sorted days)`, where normalization trims whitespace, collapses internal spaces, and lowercases text. On import into the active version, rows whose key already exists are skipped; everything else is inserted. If an organization changes its requested time, that is a new permit (the old one remains and can be deleted manually). Import shows a summary: N added, M skipped as duplicates, K broken (field name unmatched), J rejected (invalid), with row numbers and reasons for rejected rows.

### 4.5 Field name matching
An imported field name matches a field when normalized names are equal. Unmatched permits are stored with `field_id = null` and their `raw_field_name`. Deleting a field sets its permits' `field_id` to null (they become broken, not deleted).

## 5. Features

### 5.1 Map and field drawing
- Satellite map centered on the account's saved home view. A "Set home view" button saves the current center/zoom.
- Edit mode tools: draw polygon, edit vertices, drag, delete (Geoman). After drawing, a form asks for name (required, unique), field type, notes.
- Fields render in a **normal color**; fields with at least one conflicting permit render in a **conflict color**. Hover shows the field name; click opens the sidebar.
- Fields persist to Supabase on every change. There is no separate "save fields" step.

### 5.2 Excel template and import
- "Download template" generates an `.xlsx` with columns from `permitSchema`: Organization, Field (a dropdown populated with the account's current field names), Start Time and End Time (format `h:mm AM/PM`, validated), Mon through Sun as seven `Y`/blank columns, Notes, plus any extra attributes. Include a second sheet "Instructions" with a filled-in example row and plain-language rules, including: "Each row is one time slot. If your times differ by day, use a separate row for each time." The example should show an organization using two rows for different times on different days. The template must be easy for a non-technical permit holder to fill in.
- "Import permits" accepts the template format, validates every row (required fields, parseable times, end after start, at least one day), and applies de-dup per 4.4. Times outside 5:00 AM to 10:00 PM are accepted but flagged in the summary.

### 5.3 Broken permits
A "Broken permits (N)" button, visible whenever N > 0, opens a list of unmatched permits with their raw field name and a dropdown to assign a real field. Offer "apply to all permits with this raw name" since misspellings usually repeat.

### 5.4 Sidebar
- Clicking a field slides a sidebar in from the right (CSS `transform: translateX` transition, ~250 ms). Close via X or clicking the map.
- Shows field name and type, then all permits on that field grouped by organization: time slot, days, notes, extra attributes marked `showInSidebar`.
- Conflicting permits are marked in the conflict color with a line describing each conflict (4.3), including conflicts from overlapping fields.
- "Expand to calendar" button opens the calendar view.

### 5.5 Calendar view
- Full-screen overlay with a clear **Back** button (top left) returning to the map with the sidebar still open.
- FullCalendar `timeGridWeek` on a fixed generic week: day headers show weekday names only, no dates. Visible range 5:00 AM to 10:00 PM.
- Shows permits for the selected field **and** permits on fields that overlap it; the latter are visually distinct (e.g. striped or outlined) and labeled with their field name.
- A multi-day permit appears once per day it occurs.
- Overlapping permits display side by side; conflicting ones use the conflict color. Clicking an event shows its details and conflicts.

### 5.6 Edit mode
- An Edit toggle exists in both the sidebar and the calendar. Editing requires being signed in and holding the edit lock (6.3).
- Sidebar edit: per permit, change start/end (15-minute steps), days (checkboxes), field (dropdown), delete (with confirmation).
- Calendar edit: drag an event vertically to change its time; drag it to another day; resize to change duration. Everything snaps to 15 minutes.
  - **Dragging to a new time changes the time for all days of that permit** (a permit has one time slot).
  - **Dragging to a different day moves only that occurrence's day** (e.g. Mon/Wed dragged Mon to Tue becomes Tue/Wed). If the target day is already in the permit, reject the drop.
  - After any change, conflicts recompute immediately and the map colors update.
- Changes save to Supabase immediately (optimistic UI, revert with an error toast on failure). No undo/redo.

### 5.7 Versions ("saves")
- Works like save slots in a game: there is always one active version, and all viewing and editing happens on it. Edits autosave into the active version.
- Version menu: shows active version name; "Save as new version" (copies all permits of the active version into a new named version and switches to it); switch to another version; rename; delete (not allowed for the active version, confirmation required).
- Fields are not versioned.

### 5.8 Sharing
- Settings toggle "Enable share link" and a copy-link button for `#/share/<share_token>`. "Regenerate link" issues a new token (old link stops working).
- Share view is read-only: map, conflict colors, sidebar, calendar, no edit controls, no version menu. It shows the active version. It refreshes data by calling `get_shared_view` every 15 seconds so a projected view stays current while someone edits on another computer.
- The share view is also the presentation mode for the meeting: use larger base font sizes on this route.

### 5.9 Export placeholder
An "Export" button that opens a dialog saying export formats are coming soon. Structure the code so an exporter is a function `(fields, permits, conflicts) => Blob` registered in `src/export/`.

## 6. Cross-cutting requirements

### 6.1 UI
Clean, readable, works on a laptop and a projector (1280x720 minimum). Mobile is not a target but must not be broken. Light theme. The two field colors must be distinguishable for color-blind viewers (e.g. conflict also gets a thicker dashed outline).

### 6.2 Errors and loading
Every network call shows loading state and a human-readable error. No silent failures.

### 6.3 Edit lock (one editor at a time)
- On entering edit mode, the client tries to acquire `edit_locks` for the account: succeeds if no row exists or `heartbeat_at` is older than 2 minutes. Use an atomic Postgres function (`acquire_edit_lock(session_id, label)`) so two clients cannot both win.
- The holder sends a heartbeat every 30 seconds and releases the lock on leaving edit mode or closing the tab (best effort).
- Other sessions on the same account see a read-only banner: "Being edited on another device since HH:MM", with a "Take over editing" button that forcibly acquires the lock after confirmation. The displaced session drops to read-only on its next heartbeat.

### 6.4 Code organization
```
src/
  config/     permitSchema.ts, fieldTypes.ts, appConfig.ts (colors, calendar range, snap)
  logic/      time.ts, overlaps.ts, conflicts.ts, dedup.ts, matching.ts (+ .test.ts each)
  data/       supabaseClient.ts, fields.ts, permits.ts, versions.ts, settings.ts, share.ts, lock.ts
  import/     template.ts, parse.ts
  export/     index.ts (placeholder registry)
  components/ map/, sidebar/, calendar/, permits/, versions/, auth/, common/
  pages/      MainApp.tsx, SharePage.tsx, Login.tsx, Signup.tsx
supabase/
  migrations/ numbered SQL files (schema, RLS, functions)
  functions/signup-with-invite/
```
All components access data only through `src/data/`, never by calling Supabase directly.

### 6.5 Documentation
README covering: Supabase project setup (step by step, including disabling public signups and email confirmation), creating invite codes, resetting a password, GitHub secrets, deployment, and how to add a permit attribute.
