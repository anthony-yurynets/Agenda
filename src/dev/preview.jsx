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
  row({ title: 'Team sync', date: d(1), start_time: '10:00', end_time: '11:00' }),
  row({ title: '1:1 with Sam', date: d(1), start_time: '10:30', end_time: '11:30', category_id: 'c1', status: 'canceled' }),
  row({ title: 'Read · chapter 4', date: d(2), start_time: '13:00', end_time: '14:00', category_id: 'c3', source: 'ai' }),
  row({ title: 'Deep work', date: d(4), start_time: '08:00', end_time: '11:00', source: 'ai' }),
)
globalThis.__VAPOR_FAKE_SUPABASE__ = fakeSupabase
window.__fake = fakeSupabase

const [{ createRoot }, { default: Workspace }] = await Promise.all([
  import('react-dom/client'),
  import('../components/Workspace'),
  import('../index.css'),
  import('../lib/theme'),
])
const session = { user: { id: 'u1', email: 'you@example.com', user_metadata: { full_name: 'Preview User' } } }
createRoot(document.getElementById('root')).render(<Workspace session={session} />)
