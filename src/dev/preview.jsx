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
  row({ id: 'school', title: 'School', date: d(-7), start_time: '12:30', end_time: '15:30', category_id: 'c3', status: 'none', hide_upcoming: true, repeat: { freq: 'weekly', interval: 1, days: ['mon', 'tue', 'wed', 'thu', 'fri'] } }),
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
  // Already rated, for the productivity dial.
  row({ title: 'Morning reading', date: format(new Date(), 'yyyy-MM-dd'), start_time: '06:30', end_time: '07:30', category_id: 'c3', status: 'done', productivity_rating: 7 }),
)
const EDIT_TOKEN = 'preview-edit-token-0000000000000'
const BOOK_TOKEN = 'preview-book-token-0000000000000'
const GROUP_TOKEN = 'preview-group-token-000000000000'
const GROUP_EDIT_TOKEN = 'preview-group-edit-token-0000000'
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
// Fitness sample data: a few weeks of weekday training plus an AI-planned session.
{
  const T = fakeSupabase.tables
  const day = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
  const plans = {
    Push: [['Bench press', ['chest', 'triceps', 'deltoids'], 135, 8], ['Overhead press', ['deltoids', 'triceps'], 85, 8], ['Triceps pushdown', ['triceps'], 50, 12]],
    Pull: [['Pull-ups', ['upper-back', 'biceps'], 0, 8], ['Barbell row', ['upper-back', 'biceps', 'forearm'], 115, 8], ['Curls', ['biceps', 'forearm'], 30, 12]],
    Legs: [['Squat', ['quadriceps', 'gluteal', 'adductors'], 185, 6], ['Romanian deadlift', ['hamstring', 'gluteal', 'lower-back'], 155, 8], ['Calf raise', ['calves'], 90, 15]],
  }
  const order = ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs']
  let k = 0
  for (let n = -24; n <= 0; n++) {
    const date = day(n)
    const dow = new Date(`${date}T12:00`).getDay()
    if (dow === 0 || dow === 6 || (n % 7 === -3 && n < -7)) continue // weekdays, ~4/week
    const name = order[k++ % order.length]
    const wid = crypto.randomUUID()
    const doneToday = n === 0 ? false : true
    T.workouts.push({ id: wid, user_id: 'u1', title: `${name} day`, date, status: doneToday ? 'done' : 'planned', notes: '', source: 'user',
      completed_at: doneToday ? new Date(`${date}T18:00`).toISOString() : null, created_at: new Date().toISOString() })
    plans[name].forEach(([ex, muscles, w, reps], i) => {
      const eid = crypto.randomUUID()
      T.workout_exercises.push({ id: eid, user_id: 'u1', workout_id: wid, name: ex, muscles, position: i, notes: '' })
      for (let j = 0; j < 3; j++) T.workout_sets.push({ id: crypto.randomUUID(), user_id: 'u1', exercise_id: eid, position: j, reps, weight: w ? w + Math.round((n + 24) / 6) * 5 : null, done: doneToday || (i === 0 && j < 2) })
    })
  }
  const ai = crypto.randomUUID()
  T.workouts.push({ id: ai, user_id: 'u1', title: 'Upper hypertrophy', date: day(1), status: 'planned', notes: 'Planned by your AI', source: 'ai', completed_at: null, created_at: new Date().toISOString() })
  T.workout_exercises.push({ id: crypto.randomUUID(), user_id: 'u1', workout_id: ai, name: 'Incline dumbbell press', muscles: ['chest', 'deltoids'], position: 0, notes: '' })
  const run = crypto.randomUUID()
  const runEx = crypto.randomUUID()
  T.workouts.push({ id: run, user_id: 'u1', title: 'Easy run', date: day(-1), status: 'done', notes: '', source: 'user', completed_at: new Date(`${day(-1)}T07:30`).toISOString(), created_at: new Date().toISOString() })
  T.workout_exercises.push({ id: runEx, user_id: 'u1', workout_id: run, name: 'Run', kind: 'cardio', muscles: [], position: 0, notes: '' })
  T.workout_sets.push({ id: crypto.randomUUID(), user_id: 'u1', exercise_id: runEx, position: 0, minutes: 32, distance: 3.4, done: true })
}
// Competition sample data.
{
  const T = fakeSupabase.tables
  const day = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
  const opt = (name, i) => ({ id: crypto.randomUUID(), user_id: 'u1', name, position: i, created_at: new Date().toISOString() })
  const O = ['Research paper', 'Demo video', 'Source code', 'Slide deck', 'Poster', 'Abstract', 'Prototype', 'Essay'].map(opt)
  T.competition_options.push(...O)
  const P = ['Solar drone', 'Study buddy app', 'Microplastics study'].map(opt)
  T.competition_projects.push(...P)
  const proj = (n) => P.find((x) => x.name === n).id
  const by = (...names) => names.map((n) => O.find((o) => o.name === n).id)
  const comp = (o) => ({ id: crypto.randomUUID(), user_id: 'u1', url: '', description: '', prestige: null, category: 'other', submission_items: [], group_ids: [], timeline: [], source: 'user', decision: null, project_id: null, created_at: new Date(Date.now() - Math.random() * 1e10).toISOString(), ...o })
  const G = ['Summer 2027', 'Team picks'].map(opt)
  T.competition_groups.push(...G)
  const grp = (...names) => names.map((n) => G.find((x) => x.name === n).id)
  T.share_links.push({ id: 'l3', user_id: 'u1', kind: 'group', group_ids: [G[0].id], access: 'view', token: GROUP_TOKEN, name: 'Coach', created_at: new Date().toISOString() },
    { id: 'l4', user_id: 'u1', kind: 'group', group_ids: [G[0].id, G[1].id], access: 'edit', token: GROUP_EDIT_TOKEN, name: 'Teammate', created_at: new Date().toISOString() })
  T.competitions.push(
    comp({ project_id: proj('Microplastics study'), group_ids: grp('Summer 2027', 'Team picks'), name: 'Regeneron International Science and Engineering Fair', url: 'https://www.societyforscience.org/isef/', category: 'research', prestige: 10, description: 'The world’s largest pre-college STEM competition. Qualify through an affiliated regional fair.', submission_items: by('Research paper', 'Poster', 'Abstract'), timeline: [{ label: 'Regional fair', date: day(-20) }, { label: 'State fair', date: day(12) }, { label: 'ISEF finals', date: day(60), end: day(65) }] }),
    comp({ project_id: proj('Study buddy app'), name: 'Congressional App Challenge', url: 'congressionalappchallenge.us', category: 'software', prestige: 7, description: 'Build an app; judged by your district’s member of Congress.', submission_items: by('Demo video', 'Source code'), timeline: [{ label: 'Registration', date: day(-30) }, { label: 'Submission deadline', date: day(3) }, { label: 'Winners announced', date: day(45) }] }),
    comp({ decision: 'maybe', group_ids: grp('Summer 2027'), name: 'MIT THINK Scholars', url: 'https://think.mit.edu', category: 'research', prestige: 8, description: 'Research proposal competition with funding and mentorship from MIT students.', submission_items: by('Research paper', 'Essay'), timeline: [{ label: 'Proposal due', date: day(90) }, { label: 'Finalists', date: day(120) }] }),
    comp({ project_id: proj('Solar drone'), group_ids: grp('Summer 2027'), name: 'Conrad Challenge', url: 'conradchallenge.org', category: 'innovation', prestige: 6, description: 'Team innovation challenge: aerospace, energy, health, and more.', submission_items: by('Slide deck', 'Prototype', 'Demo video'), source: 'ai', timeline: [{ label: 'Stage 1 · Idea', date: day(-1) }, { label: 'Stage 2 · Business plan', date: day(9) }, { label: 'Stage 3 · Pitch', date: day(29) }] }),
    comp({ name: 'FIRST Robotics Competition', url: 'firstinspires.org', category: 'engineering', prestige: 7, submission_items: by('Prototype'), timeline: [{ label: 'Kickoff', date: day(95) }, { label: 'Regionals', date: day(150) }, { label: 'Championship', date: day(200) }] }),
    comp({ name: 'Google Code-in Hackathon', category: 'software', prestige: 4, submission_items: by('Source code', 'Demo video'), timeline: [{ label: 'Hacking', date: day(-60), end: day(-58) }, { label: 'Judging', date: day(-50) }] }),
    comp({ name: 'AMC 10', url: 'https://maa.org/student-programs/amc/', category: 'other', prestige: 8, description: 'AMC 10 → AIME.', timeline: [{ label: 'Registration', date: '2026-09-15' }, { label: 'AMC 10A', date: '2026-11-10' }, { label: 'AIME', date: '2027-02-04' }] }),
    comp({ decision: 'no', name: 'Local essay contest', category: 'other', prestige: 2, submission_items: by('Essay') }),
  )
}
// Agenda sample data: subjects, this week's assignments and exams, quick links.
{
  const T = fakeSupabase.tables
  const day = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
  const S = [['Chemistry', '#3b82f6'], ['English', '#8b5cf6'], ['Calculus', '#f97316'], ['History', '#14b8a6']].map(([name, color], i) => ({ id: crypto.randomUUID(), user_id: 'u1', name, color, position: i, created_at: new Date().toISOString() }))
  T.assignment_subjects.push(...S)
  const subj = (n) => S.find((x) => x.name === n).id
  const a = (title, due, subject, o = {}) => ({ id: crypto.randomUUID(), user_id: 'u1', title, due_date: day(due), subject_id: subj(subject), kind: 'assignment', status: 'not_started', created_at: new Date(Date.now() - Math.random() * 1e9).toISOString(), ...o })
  T.assignments.push(
    a('Lab report: titration', -2, 'Chemistry'),
    a('Read ch. 5–6, The Great Gatsby', 0, 'English', { status: 'in_progress' }),
    a('Problem set 4', 1, 'Calculus'),
    a('Unit 3 test', 2, 'Chemistry', { kind: 'exam' }),
    a('Essay outline', 2, 'English', { status: 'done' }),
    a('Primary source analysis', 3, 'History'),
    a('Derivatives quiz', 4, 'Calculus', { kind: 'exam' }),
    a('Vocab list 7', -1, 'English', { status: 'done' }),
  )
  const L = [['Google Classroom', 'https://classroom.google.com'], ['', 'https://www.khanacademy.org'], ['Desmos', 'https://www.desmos.com/calculator'], ['Gmail', 'https://mail.google.com']]
  T.dashboard_links.push(...L.map(([title, url], i) => ({ id: crypto.randomUUID(), user_id: 'u1', title, url, position: i, created_at: new Date().toISOString() })))
}
// A shared file, opened with ?as=file.
const FILE_TOKEN = 'preview-file-token-0000000000000'
{
  const note = '# Reading list\n\n- The Art of Problem Solving, vol. 1\n- Euclidean geometry notes\n'
  const path = 'u1/f1/reading-list.md'
  fakeSupabase.storage.objects.set(path, new Blob([note], { type: 'text/markdown' }))
  fakeSupabase.tables.shared_files.push({ id: 'f1', user_id: 'u1', name: 'reading-list.md', path, mime: 'text/markdown', size: note.length, token: FILE_TOKEN, created_at: new Date().toISOString() })
}
globalThis.__AGENDA_FAKE_SUPABASE__ = fakeSupabase
globalThis.__AGENDA_TEST_DB__ = fakeSupabase
window.__fake = fakeSupabase

// Run the real /api/share and /api/book handlers in the page against the fake DB.
const [{ default: shareApi }, { default: bookApi }, { default: groupApi }, { default: fileApi }] = await Promise.all([
  import('../../api/share.js'),
  import('../../api/book.js'),
  import('../../api/group.js'),
  import('../../api/file.js'),
])
const realFetch = window.fetch.bind(window)
window.fetch = async (url, init = {}) => {
  const handler = { '/api/share': shareApi, '/api/book': bookApi, '/api/group': groupApi, '/api/file': fileApi }[url]
  if (!handler) return realFetch(url, init)
  let status = 200
  let body = ''
  const res = { setHeader() {}, end: (b) => (body = b ?? ''), set statusCode(v) { status = v } }
  await handler({ method: 'POST', headers: { authorization: init.headers?.Authorization }, body: JSON.parse(init.body) }, res)
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
}

const [{ createRoot }, { default: Workspace }, { default: SharedWorkspace }, { default: BookingPage }, { default: SharedGroupPage }, { default: FileViewer }, { FILES_OWNER }] = await Promise.all([
  import('react-dom/client'),
  import('../components/Workspace'),
  import('../components/SharedWorkspace'),
  import('../components/BookingPage'),
  import('../components/competitions/SharedGroupPage'),
  import('../components/FileViewer'),
  import('../lib/files'),
  import('../index.css'),
  import('../lib/theme'),
])
// ?as=guest → edit-link view, ?as=booker → booking page, ?as=viewer / ?as=editor → shared competitions (view / edit),
// ?as=file → a shared file, default → owner (signed in as the Files owner; ?email=… to see it as someone else).
const as = new URLSearchParams(location.search).get('as')
const session = { user: { id: 'u1', email: new URLSearchParams(location.search).get('email') ?? FILES_OWNER, user_metadata: { full_name: 'Preview User' } } }
createRoot(document.getElementById('root')).render(
  as === 'guest' ? <SharedWorkspace token={EDIT_TOKEN} />
    : as === 'booker' ? <BookingPage token={BOOK_TOKEN} />
      : as === 'viewer' ? <SharedGroupPage token={GROUP_TOKEN} />
        : as === 'editor' ? <SharedGroupPage token={GROUP_EDIT_TOKEN} />
          : as === 'file' ? <FileViewer token={FILE_TOKEN} />
          : <Workspace session={session} />,
)
