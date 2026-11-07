# Agenda

A life manager, starting with a time-block calendar: nested blocks, Google sign-in, a Supabase backend, and an MCP
server so AI assistants can plan alongside you.

- **Pages:** tabs across the top (Agenda — where the app opens, Calendar, Fitness, Competitions, AMC Prep, Testing — a blank scratch page). Alt+1…9 jumps between them. Add a page
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
   (`0001_init.sql` → `0018_shared_files.sql`). All are safe to re-run.
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
claude mcp add --transport http agenda https://your-app.vercel.app/api/mcp --header "Authorization: Bearer agd_..."
```

Tools: `list_categories`, `create_category`, `list_blocks`, `get_block`, `create_block` (with nested `sub_blocks`
and an optional `repeat` rule), `update_block`, `divide_block`, `delete_block`.

Repeating blocks appear in `list_blocks` once per occurrence, with ids like `<series id>::2026-10-05`. Passing
that id to `update_block` or `delete_block` affects only that date. Passing the series id affects every occurrence.

## Agenda

Where the app opens. **Add assignment** (`A`) and **Add exam** (`E`) open a quick editor with the title focused:
type it, then `Tab` through Due (tomorrow by default), Status (Not started; assignments only), Type (set by the button) and Subject.
`Esc`, `Enter` or clicking away saves and closes; `⌘/Ctrl+Enter` saves and starts another with the same type, date and
subject. Untitled new items are dropped. Subject is a combobox: type to filter, `Tab`/`Enter` picks the highlighted one,
and a new name is created on the spot (rename or delete subjects under **Subjects**).

- **The week:** an endless strip of day boxes (no times) that opens on today and loads more days as you scroll either
  way; the arrows move a screenful, **Today** jumps back. Each day fits two cards across and three down, and scrolls
  inside if there are more. Cards show title, status, subject and type. Click a card to edit it, its status pill to cycle
  the status, a day to add something due then; drag a card to another day to move it. Overdue unfinished assignments are
  listed at the top.
- **Exams have no status:** they show an Exam badge instead, the editor hides the Status field for them, and a past
  exam just fades rather than counting as overdue.
- **Coming up:** the next 5 calendar events (repeats included, canceled ones skipped). Click one to open it in the same
  panel as on the Calendar. To keep an event out (sleep, school), turn off **Show in Coming up** in its panel; on a
  repeat it applies to the whole series, or one day if you're editing a single occurrence.
- **Quick links:** add a URL (name optional) and it shows as a favicon tile; **Edit** to rename or remove.


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

**Are we doing this?** Every competition has an answer, set right from the table's *Doing?* column or the side panel:
pick one of your projects (yes — that's what you're entering with), *Maybe*, or *No* (the row dims). Add a project
inline from the picker; manage the list under **Lists → Projects** (deleting one sends its competitions back to
undecided). Filter by answer or project, sort by *Doing*, and search matches project names.

**Groups** collect competitions into named lists (a competition can be in several). Pick a group in the bar above
the filters to scope the table to it (new competitions you add there join it), create one with **+ Group**, and
add or remove a competition from groups in its side panel. Manage the list under **Lists → Groups** (deleting a group
keeps its competitions). A selected group's **Share** button (or **Sharing → Competitions**) creates links (`/g/<token>`)
that open one or more groups you pick, without signing in:

- **Can view:** the competitions in those groups, with search and details, kept up to date. Nothing can be changed.
- **Can edit:** the full Competitions page for those groups. Guests can add, change and remove competitions there and
  add submission items or projects. They can't rename or delete your lists, make groups, share, or see anything
  outside the link's groups. Deleting a competition that's also in a group they can't see only takes it out of the
  shared groups. Their changes reach you live; they see yours within a few seconds.

Change a link's access or groups any time (an open page switches over on its next refresh); turn it off to revoke it.

Submission items come from your own option list (**Lists → Submission items**, or *Edit list* in a competition):
add, rename or delete options; deleting one removes it from every competition. Timeline stages take a date or a
"Day N" (Day 1 = the first stage) and an optional end date.

Your AI can manage it over MCP: `list_competitions` (with the same search), `get_competition`,
`create_competition`, `update_competition`, `delete_competition`, `list_submission_options`,
`manage_submission_options`, `list_projects`, `manage_projects` (set the answer with the `doing` field), `list_groups`,
`manage_groups` (put competitions in groups with the `groups` field; filter `list_competitions` by `group`). Try: *"Find 5 prestigious research competitions for high schoolers and add them with
their deadlines."*

## AMC Prep

AMC 10 → AIME prep for Oct 12 – Nov 10, 2026, linked to your AMC entry in the competition tracker (picked
automatically if one competition's name contains "AMC"; the competition's panel links back). A countdown to the
test (date editable), an editable target score, and the latest mock with its change from the one before.

- **Daily blocks:** **Add to calendar** creates the evening schedule as daily repeating blocks (Oct 12 – Nov 10) in an
  *AMC prep* category. Each day's *Topic review* occurrence is titled with that day's topic from the plan; breaks and
  dinner have no status and stay out of "Coming up". **Remove** deletes the series.
- **Notepad:** free-form Notion-style notes ("/" for blocks), saved as you type. `/math` (or `$$`) opens a TeX box with a live preview; Enter drops the typeset equation into the note, and clicking it edits the TeX again. Equations are stored as `$$ … $$` lines.
- **Mock scores:** score = 6 × correct + 1.5 × blank (wrong fills itself in), charted against the target.
- **Mock review:** click a mock to go through it problem by problem. A mock named after a real test ("AMC 10B 2024",
  "Mock 5 (AMC 10A Fall 2021)") is matched to it on its own, or pick the test from the list. Each problem shows its
  statement, the answer key (changeable), and buttons for the answer you put. Misses get a reason, topic and a note on
  why; wrong answers, and blanks on #1–18 only, go to the error log and redo queue automatically (and come back out if
  you fix the entry). Once all 25 are entered the score fills itself in.
- **Error log:** test, problem, topic, reason, key idea, redone. Filter by topic or reason; counts flag the weakest
  area; unredone problems form the redo queue.
- **Topic checklist:** four collapsible groups with percent complete.

The plan, schedule and checklist live in [`src/lib/amc.js`](src/lib/amc.js).
Past tests are in [`public/amc/`](public/amc), one JSON file each, built by
[`scripts/build_amc_problems.py`](scripts/build_amc_problems.py) from two datasets: every AMC 10 since 2000 from
[amc10-atlas](https://github.com/liyong03/amc10-atlas) (scraped from the AoPS wiki, with diagrams and topic labels) and
every AMC 12 since 2000 except 2021 from [edev2000/amc12-full](https://huggingface.co/datasets/edev2000/amc12-full)
(no diagrams, except on problems also on that year's AMC 10). [`scripts/amc_extra.json`](scripts/amc_extra.json) fills
the gaps: the four 2021 AMC 12s from archived AoPS wiki pages, and the 2026 AMC 10A/12A plus 2025 AMC 12A #25 from the
[Random Math Wiki](https://wiki.randommath.com/amc10/2026/part-a/) (scraped by
[`scripts/scrape_randommath.py`](scripts/scrape_randommath.py), diagrams in `public/amc/img/`, topics labelled by
hand). The 371 problems on both an AMC 10 and an AMC 12 agree on every answer. 2025 AMC 12A #25 has no answer key: its
correct count (8) isn't one of the choices. The 2026 AMC 10B/12B (Nov 13) aren't in yet.

## Sharing

Open **Sharing** in the sidebar.

- **Edit links** (`/s/<token>`): pick which tools (shareable pages) the link opens; anyone with it can view and edit
  just those, no sign-in, and only sees those tabs. Change a link's tools any time. Guests' changes
  reach you instantly; they see yours within a few seconds. Delete the link to revoke access.
- **Booking links** (`/b/<token>`): choose a slot length, how many bookings the link allows, and optionally an expiry
  date. Visitors see only free slots (never your block titles) inside blocks you've switched to **Open for booking**
  (in a block's details; works with repeating blocks too). A booking becomes a sub-block of that block. Other blocks
  at the same time count as busy. Times show in the visitor's own time zone.

- **Competition links** (`/g/<token>`): pick the groups a link opens and whether it can view or edit them (see
  Competitions). Create them here or from a group's **Share** button.

Guests never access the database directly: `api/share.js`, `api/book.js` and `api/group.js` check the token and act on your behalf
with the service-role key.

## Notion widget

Open **Integrations → Notion widget → Create widget**. Then either:

- in Notion type `/embed` and paste the copied link (`https://agenda.anthonyy.me/widget.html#t=…`), or
- use **Download .html** and add `agenda-widget.html` to the page (it just frames that same link).

The widget is the full calendar (grid, agenda, quick-create, sub-blocks, repeats, all-day spines, zoom, categories,
themes) without sharing or integrations. It lives on your deployed site because Notion's HTML blocks may only
connect to a few CDNs, never to Supabase. It reads and writes through the `widget_load` / `widget_write` database
functions with the token in the link. Anyone with the link can edit your calendar: keep the page private, and turn
the widget off in Integrations to revoke it.

## Shortcuts

Agenda: `A` new assignment · `E` new exam. Calendar: `N` new block · `T` today · `←/→` previous/next · `/` search · `C`/`L` calendar/list · `Esc` close · `Delete` delete selected ·
In quick-create: `Enter` save, `Esc` discard, `Alt+1…9` pick category.

**Zoom the time axis:** pinch with two fingers on a trackpad or touchscreen (or Ctrl + scroll) over the calendar.
Zoom stays anchored where your fingers are; double-click the time-zone corner to reset.

## Trying the UI without Supabase

`npm run dev`, then open http://localhost:5173/preview.html. It runs the real app against an in-memory
backend with sample data (dev server only; it's not part of the production build). Add `?as=guest` to see the
edit-link view, `?as=booker` for the booking page, or `?as=viewer` / `?as=editor` for a view / edit competition link.
