# Time Tracker

A small time-tracking front end for the Memtime interview API: browse clients, projects and tasks, review your time entries, and create or edit entries.

Built with React 18, TypeScript, Vite and TanStack Query. No UI framework; plain CSS with design tokens.

## Run it

Requires Node 18+.

```bash
npm install
cp .env.example .env      # then put your key in API_KEY
npm run dev               # http://localhost:5173
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests + an end-to-end UI test against the local mock API |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build (proxy included) on :4173 |
| `npm run mock` | Start a local mock of the API on :8787 (see below) |

Offline / without spending the real rate limit:

```bash
npm run mock
API_BASE_URL=http://localhost:8787 API_KEY=dev-key npm run dev
```

## What's in it

**Time entries** (Task 2) – the home screen. Columns: ID, Task, Comment, Start, End, Duration, Created at. Server-side pagination with `limit`/`offset` (10/25/50 rows, remembered), server-side sorting with `sortBy`/`order` by clicking a column header. Newest first by default. Click a row to edit it; delete asks for confirmation inline. "Open" jumps to an entry by ID and explains clearly when it doesn't exist (404).

**Clients and projects** (Task 1) – a tree of Client → Project → Task, including nested sub-tasks (the API's `parent` field). Every level is paginated through until complete. Each task has a "Log time" action that opens the entry form with the task already chosen. A floating arrow jumps to the bottom of a long client list and back to the top.

**Time by client** – next to the tree: logged time per client, largest first, with share of total, entry and project counts, and a note when one client takes a large share (a hint that the team may need reinforcing). Entries only carry a task ID and the API has no task-to-client lookup, so time is attributed once the app has seen a client's tasks; "Match tasks to clients" walks the client list within the rate limit and saves what it finds.

**Create / update an entry** (Task 3) – a side sheet used for both. On success a confirmation shows the entry ID and a summary of the saved entry, and the row is highlighted in the list.

## Decisions worth explaining

**The API key never reaches the browser.** The app calls same-origin `/api/v1/*`. The Vite dev and preview servers proxy that to the API and add `Authorization: Bearer …` from `.env` (no `VITE_` prefix, so it is never bundled). This also avoids CORS. In production the same job belongs to a thin backend-for-frontend, e.g. an ASP.NET Core minimal API with YARP that also holds per-user keys.

**Respecting 15 requests per minute.** Every request goes through a client-side sliding-window limiter (`src/api/rateLimiter.ts`). Instead of firing requests and collecting 429s, extra requests queue and go out as soon as a slot frees. If the server still answers 429 (e.g. another tab on the same key) the client backs off (honouring `Retry-After`) and retries up to twice. While anything is queued, a banner says why and counts down, so a slow screen never looks broken. Clients, projects and tasks are cached for 5 minutes; failed 4xx requests are not retried.

**Lazy tree, with "Expand all".** The brief describes fetching projects for every client and tasks for every project. With 15 requests per minute, doing that eagerly on page load can take minutes for a modest account. The tree loads a level when it's opened; "Expand all" does the full walk on demand, queued through the limiter.

**Pagination without a total count.** List endpoints return bare arrays. The entries table requests `limit + 1` rows to know whether a next page exists; the tree and pickers walk pages of 50 until a short page comes back.

**Choosing a task, not typing an ID.** The form picks Client → Project → Task (sub-tasks indented, inactive items disabled; a client's only project is chosen automatically). Time entries only carry `taskId`, so every task the app sees is recorded in a small persisted directory to show readable names in the table without an extra request per row.

**Time input that prevents mistakes.**
- A custom date picker: Today / Yesterday in one click, arrows to step a day, and a month calendar that is fully keyboard operable (arrows, Home/End, Page Up/Down, Enter, Escape), following the WAI-ARIA date picker pattern.
- Date, start, end and duration live in one box. Start, end and duration are typed text fields that understand "9", "930", "5pm", "1h30", "1.5" or "90m"; arrow keys nudge by 15 minutes (Shift: 1 hour). Typing a duration moves the end time.
- A running total ("2h 15m on Homepage") sits next to the save button, so the cost of an entry is always visible.
- Date + start + end in the user's own time zone (shown), converted to ISO 8601 UTC for the API.
- Defaults to the last full hour, snapped to the quarter hour.
- Duration chips (15m … 8h) and "Until now".
- An end before the start reads as "ends next day" and is labelled as such; a separate end date is available for longer spans.
- A slim 24-hour bar shows where the entry sits in the day, so AM/PM slips and wrong dates are visible before saving.
- Blocking errors (no task, no comment, zero or negative duration) appear inline after a field is touched or on submit; warnings (over 12 hours, ends in the future) do not block.
- Ctrl/Cmd + Enter saves; Escape or the backdrop closes, asking first if there are unsaved changes. Press **N** anywhere to start a new entry.

**Errors in plain language.** `describeError` maps status codes to copy that says what happened and what to do: 400 shows the server's reason ("Invalid JSON body"), 404 names the missing entry, 401/403 points at the API key, 429 explains the limit, network and 5xx errors say it's not the user's fault.

**Accessibility.** Native `<dialog>` for focus trapping and Escape, labelled controls, `aria-invalid`/`aria-describedby` on fields, `aria-sort` on sortable headers, live regions for toasts and the rate-limit banner, visible focus rings, reduced-motion support, responsive down to phone width.

## Notes on the live API

Checked against the real API in a browser:

- **Entry IDs start at 0.** The app treats `0` as a real ID everywhere (editing #0 updates it rather than creating a new entry); covered by tests.
- **Statuses are workflow states** (`pending`, `in-progress`, `completed`), not an active flag, so nothing is disabled because of its status; statuses are shown as badges.
- **Tasks come without a `parent` field.** Nested sub-tasks are still supported when `parent` is present.
- **`sortBy=name` doesn't order names naturally** ("Client 100" before "Client 51"), so clients, projects and tasks are sorted in the app ("Client 2" before "Client 10").
- **Created entries don't persist on the demo server.** A new entry shows up right after `POST` (201), but shortly after it is gone from the list and `GET`/`PUT /time-entries/:id` return 404. The app shows a clear "not found" message and refreshes the list when that happens.

## Project layout

```
src/
  api/        http client (errors, retry), rate limiter, endpoints, React Query hooks
  lib/        time helpers, task tree builder, task directory
  components/ drawer, toasts, rate-limit banner, feedback states
  features/
    hierarchy/    clients → projects → tasks tree
    timeEntries/  table, form, task picker, day strip, form validation
mock/server.mjs  local implementation of the documented API (for tests and offline dev)
```

## Tests

`npm test` runs 70 tests: the rate limiter (sliding window, penalties), the HTTP client and error copy, pagination, the task tree (nesting, orphans, cycles, missing parent), natural name sorting, the date picker (mouse and keyboard), time and duration parsing, the When control, time-per-client aggregation, date/time handling (overnight, multi-day round-trips, ISO output), form validation, and an end-to-end UI test that renders the whole app against the mock API: list, paginate, sort, open a missing ID, open and edit entry #0, create with validation, edit, and browse the tree.

## What I'd do next in a larger product

- **Backend-for-frontend** in ASP.NET Core: per-user auth instead of one shared key, server-side caching of the slow-changing hierarchy, and a single endpoint that returns entries with task/project/client names.
- **Overlap detection** against the user's other entries on the same day, and a "continue from last entry" default start time.
- **A day/week timesheet view** with totals per day and per project, since that's how people review and bill their time.
- **Search-as-you-type task picker** with recent tasks first, once the API offers search.
- **Optimistic updates and undo** for delete.
- **i18n** of all copy and locale-aware first day of week.
- **Playwright** smoke tests against a staging API in CI.
