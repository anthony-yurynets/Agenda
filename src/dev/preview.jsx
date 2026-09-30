// Dev-only: renders the real workspace + store against an in-memory backend.
import { fakeSupabase } from './fakeSupabase'
import { addDays, format, startOfWeek } from 'date-fns'

const mon = startOfWeek(new Date(), { weekStartsOn: 1 })
const d = (n) => format(addDays(mon, n), 'yyyy-MM-dd')
const cats = [
  { id: 'c0', name: 'Work', color: '#3b82f6', position: 0 },
  { id: 'c1', name: 'Personal', color: '#8b5cf6', position: 1 },
  { id: 'c2', name: 'Health', color: '#22c55e', position: 2 },
  { id: 'c3', name: 'Learning', color: '#f97316', position: 3 },
]
let n = 0
const row = (o) => ({
  id: o.id ?? `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, parent_id: null, notes: '', source: 'user',
  status: 'planned', category_id: 'c0', repeat: null, repeat_exdates: [], recurrence_id: null, recurrence_date: null, ...o,
})
fakeSupabase.tables.categories.push(...cats)
fakeSupabase.tables.blocks.push(
  row({ id: 'p1', title: 'Quarterly report', date: d(0), start_time: '09:00', end_time: '12:00', status: 'in_progress' }),
  row({ parent_id: 'p1', title: 'Outline', date: d(0), start_time: '09:00', end_time: '10:00', status: 'done' }),
  row({ id: 'p1b', parent_id: 'p1', title: 'Draft', date: d(0), start_time: '10:00', end_time: '11:30', status: 'in_progress' }),
  row({ parent_id: 'p1b', title: 'Intro', date: d(0), start_time: '10:00', end_time: '10:45', status: 'done' }),
  row({ parent_id: 'p1b', title: 'Numbers', date: d(0), start_time: '10:45', end_time: '11:30' }),
  row({ parent_id: 'p1', title: 'Review', date: d(0), start_time: '11:30', end_time: '12:00' }),
  // Series started last week: weekday gym at 07:30, with a sub-block template.
  row({ id: 'gym', title: 'Gym', date: d(-7), start_time: '07:30', end_time: '08:30', category_id: 'c2', repeat: { freq: 'weekly', interval: 1, days: ['mon', 'wed', 'fri'] } }),
  row({ parent_id: 'gym', title: 'Warm-up', date: d(-7), start_time: '07:30', end_time: '07:45', category_id: 'c2' }),
  row({ id: 'school', title: 'School', date: d(-7), start_time: '12:30', end_time: '15:30', category_id: 'c3', status: 'none', repeat: { freq: 'weekly', interval: 1, days: ['mon', 'tue', 'wed', 'thu', 'fri'] } }),
  row({ id: '22222222-2222-4222-8222-222222222222', title: 'Office hours', date: d(-7), start_time: '15:00', end_time: '17:00', category_id: 'c0', status: 'none', bookable: true, repeat: { freq: 'weekly', interval: 1, days: ['tue', 'thu'] } }),
  row({ id: '33333333-3333-4333-8333-333333333333', title: 'Design conference', date: d(2), start_time: '00:00', end_time: '24:00', all_day: true, category_id: 'c0', status: 'none' }),
  row({ parent_id: '33333333-3333-4333-8333-333333333333', title: 'Keynote', date: d(2), start_time: '09:00', end_time: '10:30', category_id: 'c0' }),
  row({ parent_id: '33333333-3333-4333-8333-333333333333', title: 'Workshop', date: d(2), start_time: '15:30', end_time: '17:30', category_id: 'c0', status: 'in_progress' }),
  row({ title: "Mom's birthday", date: d(4), start_time: '00:00', end_time: '24:00', all_day: true, category_id: 'c1', status: 'none', repeat: { freq: 'yearly', interval: 1 } }),
  row({ title: 'Pay rent', date: d(4), start_time: '00:00', end_time: '24:00', all_day: true, category_id: 'c3', status: 'planned' }),
  row({ title: 'Trip to NYC', date: d(5), start_time: '00:00', end_time: '24:00', all_day: true, category_id: 'c2', status: 'planned' }),
  row({ title: 'Team sync', date: d(1), start_time: '10:00', end_time: '11:00' }),
  row({ title: '1:1 with Sam', date: d(1), start_time: '10:30', end_time: '11:30', category_id: 'c1', status: 'canceled' }),
  row({ title: 'Read · chapter 4', date: d(2), start_time: '13:00', end_time: '14:00', category_id: 'c3', source: 'ai' }),
  row({ title: 'Deep work', date: d(4), start_time: '08:00', end_time: '11:00', source: 'ai' }),
)
const EDIT_TOKEN = 'preview-edit-token-0000000000000'
const BOOK_TOKEN = 'preview-book-token-0000000000000'
fakeSupabase.tables.share_links.push(
  { id: 'l1', user_id: 'u1', kind: 'edit', token: EDIT_TOKEN, name: 'Sam', created_at: new Date().toISOString() },
  { id: 'l2', user_id: 'u1', kind: 'booking', token: BOOK_TOKEN, name: 'Intro call', slot_minutes: 30, max_uses: 3, uses: 0,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, created_at: new Date().toISOString() },
)
// ?tools=calendar,… sets which tools the preview edit link opens (empty = none).
const toolsParam = new URLSearchParams(location.search).get('tools')
if (toolsParam !== null) fakeSupabase.tables.share_links[0].tools = toolsParam ? toolsParam.split(',') : []
for (const b of fakeSupabase.tables.blocks) b.user_id = 'u1'
for (const c of fakeSupabase.tables.categories) c.user_id = 'u1'
globalThis.__VAPOR_FAKE_SUPABASE__ = fakeSupabase
globalThis.__VAPOR_TEST_DB__ = fakeSupabase
window.__fake = fakeSupabase

// Run the real /api/share and /api/book handlers in the page against the fake DB.
const [{ default: shareApi }, { default: bookApi }] = await Promise.all([import('../../api/share.js'), import('../../api/book.js')])
const realFetch = window.fetch.bind(window)
window.fetch = async (url, init = {}) => {
  const handler = { '/api/share': shareApi, '/api/book': bookApi }[url]
  if (!handler) return realFetch(url, init)
  let status = 200
  let body = ''
  const res = { setHeader() {}, end: (b) => (body = b ?? ''), set statusCode(v) { status = v } }
  await handler({ method: 'POST', headers: { authorization: init.headers?.Authorization }, body: JSON.parse(init.body) }, res)
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
}

const [{ createRoot }, { default: Workspace }, { default: SharedWorkspace }, { default: BookingPage }] = await Promise.all([
  import('react-dom/client'),
  import('../components/Workspace'),
  import('../components/SharedWorkspace'),
  import('../components/BookingPage'),
  import('../index.css'),
  import('../lib/theme'),
])
// ?as=guest → edit-link view, ?as=booker → booking page, default → owner.
const as = new URLSearchParams(location.search).get('as')
const session = { user: { id: 'u1', email: 'you@example.com', user_metadata: { full_name: 'Preview User' } } }
createRoot(document.getElementById('root')).render(
  as === 'guest' ? <SharedWorkspace token={EDIT_TOKEN} /> : as === 'booker' ? <BookingPage token={BOOK_TOKEN} /> : <Workspace session={session} />,
)
