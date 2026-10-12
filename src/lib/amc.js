// AMC 10 prep: the 30-day plan, the daily schedule, the topic checklist, and
// scoring. Dates are 'YYYY-MM-DD' strings.

export const DEFAULT_TEST_DATE = '2026-11-10'
export const DEFAULT_TARGET = 105
export const PLAN_START = '2026-10-12'
export const PLAN_END = '2026-11-10'
export const QUESTIONS = 25

/** One row per day: [date, topic block, evening block]. */
export const PLAN = [
  ['2026-10-12', 'Algebra: linear systems, word problems, percents, averages', 'Timed set'],
  ['2026-10-13', 'Algebra: quadratics, Vieta, SFFT, factorizations', 'Timed set'],
  ['2026-10-14', 'Algebra: functions, sequences, telescoping, floor', 'Timed set'],
  ['2026-10-15', 'Algebra: exponents, logs, absolute value, AM-GM, polynomials', 'Timed set'],
  ['2026-10-16', 'NT: primes, divisibility, divisor counting, GCD/LCM', 'Timed set'],
  ['2026-10-17', 'NT: modular arithmetic, last digits, bases, factorials, Diophantine', 'Timed set'],
  ['2026-10-18', 'Light warmup', 'Mock 1 (AMC 10A 2019)'],
  ['2026-10-19', 'Counting: casework, complement, perms/combos, stars and bars', 'Timed set'],
  ['2026-10-20', 'Counting: PIE, symmetry, paths, recursion, pigeonhole', 'Timed set'],
  ['2026-10-21', 'Probability: conditional, expected value, geometric, states', 'Timed set'],
  ['2026-10-22', 'Geometry: angles, triangles, similarity, area formulas', 'Timed set'],
  ['2026-10-23', 'Geometry: circles, power of a point, cyclic quads', 'Timed set'],
  ['2026-10-24', 'Geometry: coordinates, polygons, 3D, trig', 'Timed set'],
  ['2026-10-25', 'Light warmup', 'Mock 2 (AMC 10B 2019)'],
  ['2026-10-26', 'Weakest topic', 'Problems 16–25, untimed'],
  ['2026-10-27', 'Second-weakest topic', 'Mock 3 (AMC 10A 2020)'],
  ['2026-10-28', 'Error log redo', 'Weak-topic drilling'],
  ['2026-10-29', 'Speed drill #1–10', 'Mock 4 (AMC 10B 2020)'],
  ['2026-10-30', 'Error log redo', 'Weak-topic drilling'],
  ['2026-10-31', 'Formula sheet', 'Mock 5 (AMC 10A Fall 2021)'],
  ['2026-11-01', 'Error log redo', 'Weak-topic drilling'],
  ['2026-11-02', 'Speed drill #1–10', 'Mock 6 (AMC 10B 2022)'],
  ['2026-11-03', 'Error log redo', 'Weak-topic drilling'],
  ['2026-11-04', 'Formula sheet', 'Mock 7 (AMC 10A 2023)'],
  ['2026-11-05', 'Error log redo', 'Weak-topic drilling'],
  ['2026-11-06', 'Speed drill #1–10', 'Mock 8 (AMC 10B 2024)'],
  ['2026-11-07', 'Error log redo', 'Weak-topic drilling'],
  ['2026-11-08', 'Formula sheet', 'Mock 9 (AMC 10A 2025)'],
  ['2026-11-09', 'Redo error-log problems only', 'Stop by 10 pm'],
  ['2026-11-10', 'Light: 10 easy problems', 'Rest, sleep early'],
].map(([date, topic, evening]) => ({ date, topic, evening }))

/**
 * The daily schedule (minutes from midnight). `topic: true` is the block titled
 * with that day's topic; `rest` blocks have no status to tick off.
 */
export const SCHEDULE = [
  { title: 'Topic review', start: 16 * 60, end: 17 * 60 + 30, topic: true },
  { title: 'Break', start: 17 * 60 + 30, end: 17 * 60 + 45, rest: true },
  { title: 'Topic drilling', start: 17 * 60 + 45, end: 19 * 60 + 15 },
  { title: 'Dinner', start: 19 * 60 + 15, end: 19 * 60 + 45, rest: true },
  { title: 'Timed set / mock', start: 19 * 60 + 45, end: 21 * 60 },
  { title: 'Break', start: 21 * 60, end: 21 * 60 + 15, rest: true },
  { title: 'Error review', start: 21 * 60 + 15, end: 22 * 60 + 45 },
  { title: 'Light review (formula sheet + old error-log problems)', start: 22 * 60 + 45, end: 23 * 60 + 30, notes: 'Stop at 11:30.' },
]

export const TOPICS = [
  { id: 'algebra', label: 'Algebra', short: 'Alg' },
  { id: 'counting', label: 'Counting & Probability', short: 'C&P' },
  { id: 'number_theory', label: 'Number Theory', short: 'NT' },
  { id: 'geometry', label: 'Geometry', short: 'Geo' },
]
export const topicLabel = (id) => TOPICS.find((t) => t.id === id)?.label ?? id

export const REASONS = [
  { id: 'concept', label: 'Concept gap' },
  { id: 'careless', label: 'Careless' },
  { id: 'time', label: 'Time' },
  { id: 'misread', label: 'Misread' },
]
export const reasonLabel = (id) => REASONS.find((r) => r.id === id)?.label ?? id

/** Topic checklist. Item ids are stored in amc_prep.topics_done, so keep them stable. */
export const CHECKLIST = {
  algebra: [
    ['alg-linear', 'Linear systems & word problems'],
    ['alg-percent', 'Percents, ratios & averages'],
    ['alg-quad', 'Quadratics & Vieta’s formulas'],
    ['alg-sfft', 'Simon’s Favorite Factoring Trick'],
    ['alg-factor', 'Factorizations (squares, cubes, grouping)'],
    ['alg-func', 'Functions & composition'],
    ['alg-seq', 'Arithmetic & geometric sequences'],
    ['alg-tele', 'Telescoping sums & products'],
    ['alg-floor', 'Floor & ceiling'],
    ['alg-explog', 'Exponents & logarithms'],
    ['alg-abs', 'Absolute value & inequalities'],
    ['alg-amgm', 'AM-GM'],
    ['alg-poly', 'Polynomials (roots, remainder theorem)'],
  ],
  counting: [
    ['cp-case', 'Casework'],
    ['cp-comp', 'Complementary counting'],
    ['cp-perm', 'Permutations & combinations'],
    ['cp-stars', 'Stars and bars'],
    ['cp-pie', 'Inclusion–exclusion (PIE)'],
    ['cp-sym', 'Symmetry'],
    ['cp-paths', 'Lattice paths'],
    ['cp-rec', 'Recursion'],
    ['cp-pigeon', 'Pigeonhole'],
    ['cp-cond', 'Conditional probability'],
    ['cp-ev', 'Expected value'],
    ['cp-geo', 'Geometric probability'],
    ['cp-states', 'States (Markov-style)'],
  ],
  number_theory: [
    ['nt-primes', 'Primes & prime factorization'],
    ['nt-div', 'Divisibility rules'],
    ['nt-divcount', 'Counting & summing divisors'],
    ['nt-gcd', 'GCD / LCM'],
    ['nt-mod', 'Modular arithmetic'],
    ['nt-last', 'Last digits & cycles'],
    ['nt-bases', 'Number bases'],
    ['nt-fact', 'Factorials & trailing zeros'],
    ['nt-dioph', 'Diophantine equations'],
  ],
  geometry: [
    ['geo-angles', 'Angle chasing'],
    ['geo-tri', 'Triangles (Pythagorean, special right)'],
    ['geo-sim', 'Similarity'],
    ['geo-area', 'Area formulas (Heron, ½ab sin C, shoelace)'],
    ['geo-circ', 'Circles (inscribed angles, tangents)'],
    ['geo-pop', 'Power of a point'],
    ['geo-cyclic', 'Cyclic quadrilaterals'],
    ['geo-coord', 'Coordinate geometry'],
    ['geo-poly', 'Polygons'],
    ['geo-3d', '3D solids'],
    ['geo-trig', 'Trigonometry'],
  ],
}

const dayNum = (iso) => Math.round(new Date(`${iso}T00:00:00Z`).getTime() / 86_400_000)
export const daysUntil = (from, to) => dayNum(to) - dayNum(from)
export const fmtDay = (iso, opts = { month: 'short', day: 'numeric' }) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString([], opts) : '')

/** Wrong answers when left empty: whatever isn't correct or blank. */
export const wrongOf = (m) => m.wrong ?? (m.correct != null && m.blank != null ? QUESTIONS - m.correct - m.blank : null)

/** AMC 10 score: 6 per correct, 1.5 per blank. Null until graded. */
export const scoreOf = (m) => (m.correct == null ? null : 6 * m.correct + 1.5 * (m.blank ?? 0))

/** Graded mocks, oldest first. */
export const scoredMocks = (mocks) =>
  mocks
    .filter((m) => scoreOf(m) !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.created_at ?? '').localeCompare(b.created_at ?? ''))

/** Counts per key (topic or reason), in the order of `list`. */
export function countBy(errors, key, list) {
  const out = Object.fromEntries(list.map((x) => [x.id, 0]))
  for (const e of errors) if (e[key] in out) out[e[key]]++
  return out
}

/** The AMC entry in the competition tracker, if exactly one looks like it. */
export const guessAmcCompetition = (comps) => {
  const hits = comps.filter((c) => /\bamc\b/i.test(c.name ?? ''))
  return hits.length === 1 ? hits[0] : (hits.find((c) => /\bamc\s*10\b/i.test(c.name)) ?? null)
}
