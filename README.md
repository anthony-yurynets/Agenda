# Vapor

A life manager, starting with a time-block calendar: nested blocks, Google sign-in, a Supabase backend, and an MCP
server so AI assistants can plan alongside you.

- **Pages:** tabs across the top (Calendar, Fitness, Competitions, Testing — a blank scratch page). Alt+1…9 jumps between them. Add a page
  in [`src/pages/index.js`](src/pages/index.js) and render it in `Workspace`.

- **Blocks** have a title, date, time range, category and status. Status sets the card color; the side bar shows the category color.
  Fixed commitments (sleep, school) can use **No status**: shown in neutral grey with nothing to tick off.
- **All-day blocks** are drawn as *day spines*: a slim ribbon down the right edge of the day with its title set
  vertically (it stays pinned while you scroll), and the whole day takes on the category's color. Double-click a day's
  header to add one. Give an all-day block timed sub-blocks (a conference's sessions) and they appear in the grid.
- **Divide** any block into sub-blocks, and those into more, as deep as you like.
- **Repeats:** daily, weekdays, weekends, any set of weekdays, every N days/weeks/months/years, monthly on a date or
  on the Nth weekday ("2nd Tuesday", "last Friday"), yearly; ending never, on a date, or after N times. Editing one occurrence
  (say, marking today's gym done) changes only that day. "Edit series" changes all of them.
- **Light and dark** themes, or follow the system setting (switch at the bottom of the sidebar).
- **Snappy:** drag on the grid (or press `N`) and the block appears instantly. Type a name, pick a category and status, then press Enter. Writes happen in the background.
- **Sharing:** an edit link lets anyone view and edit your calendar without signing in. A booking link lets people
  pick a free time inside blocks you've marked *Open for booking*; it stops working after the number of uses you set.
- **AI via MCP:** `/api/mcp` exposes tools to list, create, update, divide and delete blocks. Changes stream into the open app through Supabase Realtime.

## Setup

1. **Env:** `cp .env.example .env` and fill in the values from Supabase → Project Settings → API.
2. **Database:** open Supabase → SQL Editor and run each file in [`supabase/migrations`](supabase/migrations) in order
   (`0001_init.sql` → `0010_competitions.sql`). All are safe to re-run.
3. **Google sign-in:**
   - In Google Cloud Console → APIs & Services → Credentials, create an *OAuth client ID* (Web application).
     Add the authorized redirect URI `https://<your-project-ref>.supabase.co/auth/v1/callback`.
   - In Supabase → Authentication → Sign In / Providers → **Google**, enable it and paste the client ID and secret.
   - In Supabase → Authentication → URL Configuration, set the **Site URL** to your production URL and add
     `http://localhost:5173` (and your Vercel URL) to **Redirect URLs**.
4. `npm install && npm run dev`, then open http://localhost:5173. The dev server also serves `/api/mcp`.

## Deploy to Vercel

Import the repo in Vercel (framework preset: Vite) and add the same three env vars. That's it: the SPA and the
`api/mcp.js` serverless function deploy together, so no separate server is needed. Add the Vercel URL to
Supabase's Redirect URLs.

## Connect an AI

In the app, open **Integrations**, create a token, and copy one of the snippets. For example, in Claude Code:

```bash
claude mcp add --transport http vapor https://your-app.vercel.app/api/mcp --header "Authorization: Bearer vpr_..."
```

Tools: `list_categories`, `create_category`, `list_blocks`, `get_block`, `create_block` (with nested `sub_blocks`
and an optional `repeat` rule), `update_block`, `divide_block`, `delete_block`.

Repeating blocks appear in `list_blocks` once per occurrence, with ids like `<series id>::2026-10-05`. Passing
that id to `update_block` or `delete_block` affects only that date. Passing the series id affects every occurrence.

## Fitness

A bento dashboard: a body map colored by how recovered each muscle is (fresh → fatigued, with "fresh in ~Xh"),
a frosted workout timeline, this week's weekday sessions against your goal, a weekly streak, today's plan or a
suggestion from what's recovered, sets per muscle over 7 days, and personal records. Open a workout to log reps,
weight and completed sets; "Last time" shows your previous numbers for each exercise.

Recovery: each completed set adds fatigue to its muscles (main muscle 1.0, others 0.5) that fades exponentially,
slower for big muscles (see [`src/lib/fitness.js`](src/lib/fitness.js)).

Your AI can plan and log workouts over MCP: `get_fitness_summary` (start here), `list_workouts`, `get_workout`,
`create_workout`, `update_workout`, `add_exercise`, `update_exercise`, `log_sets`, `delete_workout`,
`delete_exercise`. Try: *"Look at my recovery and plan my workouts for next week, weekdays only."*

## Competitions

A frosted table of competitions you're tracking: name, link and description, category (Research, Software,
Innovation, Engineering, Other), prestige out of 10, submission items, and a timeline of stages drawn as a track with
a "today" marker and a countdown to the next date. An "up next" strip shows every stage in the next 45 days.

Search is instant and typo-tolerant: it matches whole words, prefixes, initials (`isef`), one-letter typos
(`enginering`) and scattered letters in the name, across name, description, items, stage names and link. Filters
mix in: `#research` / `cat:soft`, `>7` / `p>=8` / `p:9` (prestige), `soon` (a stage within 14 days). Press `/` to
search, ↑/↓ to move through rows, Enter to open. **Filter** narrows by category, status (not started / in progress / finished / no
dates), next date within 7/30/90 days, minimum prestige, and submission items (needs any or all); active filters show
as removable chips and are remembered per browser. The logic lives in [`src/lib/competitions.js`](src/lib/competitions.js).

Submission items come from your own option list (**Items** in the header, or *Edit list* in a competition):
add, rename or delete options; deleting one removes it from every competition. Timeline stages take a date or a
"Day N" (Day 1 = the first stage) and an optional end date.

Your AI can manage it over MCP: `list_competitions` (with the same search), `get_competition`,
`create_competition`, `update_competition`, `delete_competition`, `list_submission_options`,
`manage_submission_options`. Try: *"Find 5 prestigious research competitions for high schoolers and add them with
their deadlines."*

## Sharing

Open **Sharing** in the sidebar.

- **Edit links** (`/s/<token>`): pick which tools (shareable pages) the link opens; anyone with it can view and edit
  just those, no sign-in, and only sees those tabs. Change a link's tools any time. Guests' changes
  reach you instantly; they see yours within a few seconds. Delete the link to revoke access.
- **Booking links** (`/b/<token>`): choose a slot length, how many bookings the link allows, and optionally an expiry
  date. Visitors see only free slots (never your block titles) inside blocks you've switched to **Open for booking**
  (in a block's details; works with repeating blocks too). A booking becomes a sub-block of that block. Other blocks
  at the same time count as busy. Times show in the visitor's own time zone.

Guests never access the database directly: `api/share.js` and `api/book.js` check the token and act on your behalf
with the service-role key.

## Notion widget

Open **Integrations → Notion widget → Create widget**. Then either:

- in Notion type `/embed` and paste the copied link (`https://vapor.anthonyy.me/widget.html#t=…`), or
- use **Download .html** and add `vapor-widget.html` to the page (it just frames that same link).

The widget is the full calendar (grid, agenda, quick-create, sub-blocks, repeats, all-day spines, zoom, categories,
themes) without sharing or integrations. It lives on your deployed site because Notion's HTML blocks may only
connect to a few CDNs, never to Supabase. It reads and writes through the `widget_load` / `widget_write` database
functions with the token in the link. Anyone with the link can edit your calendar: keep the page private, and turn
the widget off in Integrations to revoke it.

## Shortcuts

`N` new block · `T` today · `←/→` previous/next · `/` search · `C`/`L` calendar/list · `Esc` close · `Delete` delete selected ·
In quick-create: `Enter` save, `Esc` discard, `Alt+1…9` pick category.

**Zoom the time axis:** pinch with two fingers on a trackpad or touchscreen (or Ctrl + scroll) over the calendar.
Zoom stays anchored where your fingers are; double-click the time-zone corner to reset.

## Trying the UI without Supabase

`npm run dev`, then open http://localhost:5173/preview.html. It runs the real app against an in-memory
backend with sample data (dev server only; it's not part of the production build). Add `?as=guest` to see the
edit-link view, or `?as=booker` for the booking page.
