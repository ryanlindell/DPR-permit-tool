# Claude Code Prompts: Field Permit Scheduler

## Run order

```
Phase 0  Foundation                    (alone, first)
            |
   +--------+---------+
   |        |         |
  1A       1B        1C                (in parallel, separate branches)
  Map    Import    Calendar
   |        |         |
   +--------+---------+
            |  merge all three
Phase 2  Integration                   (alone)
            |
       +----+----+
       |         |
      3A        3B                     (in parallel, separate branches)
   Versions   Sharing + lock
       |         |
       +----+----+
            |  merge both
Phase 4  Hardening and docs            (alone)
```

**How to run parallel phases:** after Phase 0 is merged to `main`, create one branch and one git worktree per parallel prompt, for example:

```
git worktree add ../fps-map   -b phase-1a-map
git worktree add ../fps-import -b phase-1b-import
git worktree add ../fps-cal   -b phase-1c-calendar
```

Open a separate Claude Code session in each folder, give each its prompt, then merge the branches into `main` one at a time, running `npm test` and `npm run build` after each merge. Each parallel prompt lists the folders it owns so the branches rarely touch the same files.

**Before every phase:** start in plan mode, let Claude Code read SPEC.md and propose a plan, review it, then let it build. Test the "Done when" list yourself before moving on.

---

## Phase 0: Foundation

```
Read SPEC.md fully. It is the source of truth for this project. We are building it in phases; this is Phase 0 (Foundation). Later phases will run in parallel on separate branches, so your most important job is to define clean interfaces that other sessions can build against.

Build:
1. Vite + React + TypeScript project with ESLint, Vitest, and a GitHub Actions workflow that builds and deploys to GitHub Pages (correct Vite base path, HashRouter, env vars from secrets).
2. Supabase migrations in supabase/migrations/ for every table, index, constraint, and RLS policy in SPEC.md section 3, plus the Postgres functions get_shared_view and acquire_edit_lock, and a trigger or function that creates account_settings and a default "Original" version for each new user.
3. The signup-with-invite Edge Function.
4. Login and Signup pages (username + password, invite code on signup) with the synthetic email mapping.
5. All of src/config/ and src/logic/ from SPEC.md section 4, with thorough Vitest tests covering edge cases (back-to-back times, shared edges between fields, multi-day permits, whitespace and case in de-dup and matching).
6. The complete src/data/ layer with typed functions for every read and write later phases will need (fields, overlaps, permits scoped to the active version, versions, settings, share, lock). Define the shared TypeScript types (Field, Permit, Version, Conflict, AccountSettings) in one place.
7. The app shell for MainApp: top bar (account name, placeholder Version menu, Import, Download template, Broken permits, Export placeholder, Settings, Sign out), a full-screen map area with a placeholder, and empty mount points for the sidebar and calendar overlay.
8. Placeholder component files with their final props interfaces for: FieldMap (src/components/map/), PermitCalendar (src/components/calendar/), ImportDialog and BrokenPermitsDialog (src/components/permits/). Each renders a simple placeholder. Write the props interfaces carefully and document them with comments, because parallel sessions will implement them without changing their signatures.
9. A README with the Supabase setup steps from SPEC.md 6.5.

Do not implement the map drawing, import parsing, calendar, sidebar, versions UI, or sharing UI.

Done when: npm test passes; npm run build succeeds; I can follow the README to set up Supabase, create an invite code, sign up, log in, and see the app shell deployed on GitHub Pages; a second account cannot read the first account's rows (explain how you verified this).
```

---

## Phase 1A: Map and fields (parallel)

```
Read SPEC.md fully. Phase 0 is complete: the data layer, types, logic modules, and component interfaces already exist. You are implementing Phase 1A (Map and fields) on its own branch while other sessions build the importer and the calendar in parallel.

You own: src/components/map/ and any new files you add there. You may make small, clearly necessary additions to src/data/fields.ts. Do not change the FieldMap props interface, src/logic/, src/config/permitSchema.ts, or files owned by other phases. If you believe an interface must change, stop and tell me instead.

Build SPEC.md section 5.1 and section 4.2:
- Leaflet map with Esri World Imagery and attribution, home view load and "Set home view".
- Geoman drawing, vertex editing, dragging, and deleting of polygons, only in edit mode.
- The new-field form (name unique, type, notes) and editing those properties later.
- Persist every change through src/data/.
- Incremental overlap recompute on create/edit/delete using src/logic/overlaps.ts, written to field_overlaps; a "Recompute all overlaps" function exposed for the settings page.
- Normal vs conflict styling driven by a prop (the set of conflicting field ids), including the color-blind-safe dashed outline. Clicking a field calls the onFieldSelect prop.

Done when: I can draw four fields including two that overlap and two that share only an edge, reload the page, and see them persist; field_overlaps contains exactly one row (the true overlap); editing a polygon so the overlap disappears removes that row.
```

---

## Phase 1B: Excel template, import, broken permits (parallel)

```
Read SPEC.md fully. Phase 0 is complete. You are implementing Phase 1B (Import) on its own branch while other sessions build the map and calendar in parallel.

You own: src/import/, src/components/permits/ImportDialog*, src/components/permits/BrokenPermits*. You may make small, clearly necessary additions to src/data/permits.ts. Do not change component props interfaces, src/logic/, or files owned by other phases. If an interface must change, stop and tell me.

Build SPEC.md sections 4.4, 4.5, 5.2, 5.3:
- Template generation with exceljs: columns driven by permitSchema, Field dropdown from the account's current fields, Y/blank day columns, time validation, and an Instructions sheet with an example row written for a non-technical reader.
- Parsing and validation of an uploaded file, de-duplication against the active version, insertion via src/data/, and the import summary (added / duplicates / broken / rejected with row numbers and reasons / out-of-hours flags).
- The Broken permits dialog with per-permit field assignment and "apply to all with this raw name".
- Put parsing and validation in pure functions with Vitest tests, including a committed sample .xlsx fixture with good rows, duplicates, a misspelled field, and invalid rows.

Done when: I can download the template, open it in Excel and see the Field dropdown, fill it in, import it, re-import the same file and get 0 added, and fix a misspelled field from the Broken permits dialog.
```

---

## Phase 1C: Calendar component (parallel)

```
Read SPEC.md fully. Phase 0 is complete. You are implementing Phase 1C (Calendar) on its own branch while other sessions build the map and importer in parallel. The calendar must be a self-contained component driven entirely by props; it will be wired to real data in Phase 2.

You own: src/components/calendar/. Do not change the PermitCalendar props interface, src/logic/, src/data/, or files owned by other phases. If an interface must change, stop and tell me.

Build SPEC.md section 5.5 and the calendar half of 5.6:
- FullCalendar timeGridWeek on a generic week with weekday-only headers, 5:00 AM to 10:00 PM, 15-minute snapping.
- Rendering of permits for the selected field plus visually distinct, labeled permits from overlapping fields; one event per occurrence day; conflict coloring using src/logic/conflicts.ts; click to see details and conflicts.
- Edit mode (a prop): vertical drag changes the permit's time for all days, horizontal drag moves only that occurrence's day, resize changes duration, drops onto a day the permit already has are rejected. Emit changes through the onPermitChange prop rather than saving anything yourself.
- A dev-only demo page (e.g. #/dev/calendar, excluded from production navigation) with realistic mock data including multi-day permits and conflicts, so the component can be tested before Phase 2.

Done when: on the demo page, conflicting events are clearly shown side by side in the conflict color, and every drag rule above behaves as specified (show me how you tested each).
```

---

## Phase 2: Integration (after merging 1A, 1B, 1C)

```
Read SPEC.md fully. Phases 0, 1A, 1B, and 1C are merged. You are implementing Phase 2 (Integration), which connects them into the working app.

Build:
- App state that loads fields, overlaps, and active-version permits, and recomputes conflicts whenever permits change.
- The sliding sidebar (SPEC.md 5.4) with grouped permits and conflict descriptions.
- "Expand to calendar" opening PermitCalendar as a full-screen overlay with a Back button, wired to real data.
- Edit mode in the sidebar (5.6) and wiring of calendar edits to src/data/ with optimistic updates and error rollback.
- Map conflict coloring driven by live conflict results.
- Import and broken-permit fixes refresh everything without a page reload.
- For now, edit mode is available to any signed-in user; the edit lock arrives in Phase 3B, so put the edit-mode toggle behind a single function (e.g. canEdit()) that 3B will replace.

Also fix any integration bugs between the merged phases, and list anything in SPEC.md that the merged code does not yet satisfy.

Done when: the full workflow works end to end: draw fields, import permits, see conflict-colored fields, open the sidebar, open the calendar, drag a permit out of conflict, and watch the map color update.
```

---

## Phase 3A: Versions (parallel)

```
Read SPEC.md fully. Phases 0 through 2 are merged. You are implementing Phase 3A (Versions) on its own branch while another session builds sharing and the edit lock.

You own: src/components/versions/ and src/data/versions.ts. Touch shared app state only as much as needed to switch the active version. Do not modify sharing, lock, or settings code.

Build SPEC.md 5.7: the version menu, "Save as new version" (copy permits in one database operation or a Postgres function so a partial copy cannot happen), switching, renaming, and deleting non-active versions with confirmation. Switching versions reloads permits and conflicts.

Done when: I can save "Plan B", change permits in it, switch back to "Original" and see the original schedule untouched, then switch to "Plan B" again and see my changes.
```

---

## Phase 3B: Sharing and edit lock (parallel)

```
Read SPEC.md fully. Phases 0 through 2 are merged. You are implementing Phase 3B (Sharing and edit lock) on its own branch while another session builds versions.

You own: src/pages/SharePage.tsx, src/data/share.ts, src/data/lock.ts, the Settings page share section, and the canEdit() function introduced in Phase 2. Do not modify version code.

Build SPEC.md 5.8 and 6.3:
- Share toggle, copy link, regenerate link; the read-only SharePage using get_shared_view with 15-second refresh and larger presentation font sizes; reuse the existing map, sidebar, and calendar components in read-only mode.
- Edit lock acquisition, heartbeat, release, the read-only banner, and "Take over editing".

Done when: a logged-out browser on the share link sees the schedule and picks up an edit made elsewhere within about 15 seconds; disabling sharing makes the link show a friendly "not available" message; two browsers logged into the same account cannot both be in edit mode, and "Take over" works.
```

---

## Phase 4: Hardening and docs (after merging 3A, 3B)

```
Read SPEC.md fully. All feature phases are merged. This is Phase 4 (Hardening).

1. Security review: re-read every RLS policy, security definer function, and the Edge Function. Try to break them: can an anonymous user read any table? Can user A read or write user B's data? Can the share function leak another account or a disabled share? Can the invite code be bypassed? Report findings and fix them.
2. Walk through every requirement in SPEC.md and produce a checklist of met / partially met / not met, then fix the gaps.
3. Test the projector case at 1280x720 and fix layout issues.
4. Finish the README, including a short "How to use" section written for my boss, who is not technical.
```
