# Vapor

A time-block calendar with nested blocks, Google sign-in, a Supabase backend, and an MCP server so AI assistants can plan alongside you.

- **Blocks** have a title, date, time range, category and status. Status sets the card color; the side bar shows the category color.
  Fixed commitments (sleep, school) can use **No status**: shown in neutral grey with nothing to tick off.
- **Divide** any block into sub-blocks, and those into more, as deep as you like.
- **Repeats:** daily, weekdays, weekends, any set of weekdays, every N days/weeks/months/years, monthly on a date or
  on the Nth weekday ("2nd Tuesday", "last Friday"), yearly; ending never, on a date, or after N times. Editing one occurrence
  (say, marking today's gym done) changes only that day. "Edit series" changes all of them.
- **Light and dark** themes, or follow the system setting (switch at the bottom of the sidebar).
- **Snappy:** drag on the grid (or press `N`) and the block appears instantly. Type a name, pick a category and status, then press Enter. Writes happen in the background.
- **AI via MCP:** `/api/mcp` exposes tools to list, create, update, divide and delete blocks. Changes stream into the open app through Supabase Realtime.

## Setup

1. **Env:** `cp .env.example .env` and fill in the values from Supabase → Project Settings → API.
2. **Database:** open Supabase → SQL Editor and run each file in [`supabase/migrations`](supabase/migrations) in order
   (`0001_init.sql`, `0002_repeats.sql`, `0003_statusless.sql`). All are safe to re-run.
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

## Shortcuts

`N` new block · `T` today · `←/→` previous/next · `/` search · `C`/`L` calendar/list · `Esc` close · `Delete` delete selected ·
In quick-create: `Enter` save, `Esc` discard, `Alt+1…9` pick category.

## Trying the UI without Supabase

`npm run dev`, then open http://localhost:5173/preview.html. It runs the real app against an in-memory
backend with sample data (dev server only; it's not part of the production build).
