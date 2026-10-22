import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { ExternalLink, Eye, FolderOpen, Search, X } from 'lucide-react'
import { callShareApi } from '../../lib/backends'
import { sharedCompBackend } from '../../lib/compBackends'
import CompetitionsPage from '../../pages/CompetitionsPage'
import Toasts from '../Toasts'
import { useToasts } from '../useToasts'
import { localToday } from '../../state/useFitness'
import {
  buildIndex,
  fmtDate,
  hostOf,
  normalizeUrl,
  parseQuery,
  prestigeTier,
  searchCompetitions,
  sortCompetitions,
  timelineState,
} from '../../lib/competitions'
import { CategoryPill, Countdown, DecisionBadge, Highlight, PrestigeMeter, TimelineTrack } from './CompBits'
import Logo from '../Logo'
import { notesPreview } from '../../lib/notes'
import NotesEditor from '../NotesEditor'

const POLL_MS = 30_000
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]))

/** Read-only details for one competition. */
function ViewPanel({ comp: c, optionsById, projectsById, tl, onClose }) {
  const href = normalizeUrl(c.url)
  const tier = prestigeTier(c.prestige)
  const items = (c.submission_items ?? []).map((id) => optionsById[id]).filter(Boolean)
  return (
    <aside className="comp-panel" aria-label="Competition details">
      <div className="bp-head">
        <CategoryPill id={c.category} />
        <span className="flex1" />
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className="bp-scroll view-panel">
        <h3 className="vp-name">{c.name || 'Untitled competition'}</h3>
        {href && (
          <a href={href} target="_blank" rel="noreferrer" className="comp-link">
            {hostOf(c.url)} <ExternalLink size={12} />
          </a>
        )}
        {c.description && <NotesEditor readOnly value={c.description} label="Description" />}

        <span className="field-label">Are we doing this?</span>
        <DecisionBadge comp={c} projectsById={projectsById} undecided="Undecided" />

        <span className="field-label">Prestige {tier && <span className="count">{tier.label}</span>}</span>
        <PrestigeMeter value={c.prestige} />

        <span className="field-label">Submission items</span>
        <div className="item-chips">
          {items.map((o) => (
            <span key={o.id} className="item-chip">
              {o.name}
            </span>
          ))}
          {!items.length && <span className="muted small">None listed</span>}
        </div>

        <span className="field-label">Timeline</span>
        {tl.stages.length ? (
          <ol className="tl-rail">
            {tl.stages.map((s) => {
              const today = localToday()
              const state = (s.end ?? s.date) < today ? 'past' : s.date <= today ? 'now' : 'future'
              return (
                <li key={s.index} className={`tl-row ${state}`}>
                  <span className="tl-node" aria-hidden="true" />
                  <div className="tl-row-main vp-stage">
                    <strong>{s.label || `Stage ${s.index + 1}`}</strong>
                    <span className="muted small">
                      {fmtDate(s.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      {s.end && ` – ${fmtDate(s.end, { month: 'short', day: 'numeric' })}`} · Day {s.day}
                    </span>
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <span className="muted small">No dates yet</span>
        )}
      </div>
    </aside>
  )
}

function BrokenLink({ message }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <Logo size={30} />
          <span>Agenda</span>
        </div>
        <h1>This link doesn’t work</h1>
        <p className="muted">{message} Ask the person who shared it for a new one.</p>
      </div>
    </div>
  )
}

/**
 * An edit link: the real Competitions page, reading and writing through
 * /api/group. If the owner turns the link off or back to view-only, `onChange`
 * hands control back to SharedGroupPage.
 */
function SharedEditor({ token, onChange }) {
  const { toasts, push: toast, dismiss } = useToasts()
  const backend = useMemo(() => {
    const base = sharedCompBackend(token)
    return {
      ...base,
      async load() {
        const res = await base.load()
        if (res.error?.status === 401 || res.error?.status === 404) onChange({ status: 'error', message: res.error.message })
        else if (res.info && res.info.access !== 'edit') onChange({ status: 'view' })
        return res
      },
    }
  }, [token, onChange])
  return (
    <div className="shared-group">
      <CompetitionsPage backend={backend} toast={toast} />
      <Toasts toasts={toasts} dismiss={dismiss} />
    </div>
  )
}

/** /g/<token>: competitions shared with a link, no sign-in. Edit links open the full editor. */
export default function SharedGroupPage({ token }) {
  const [mode, setMode] = useState({ status: 'loading' })
  useEffect(() => {
    callShareApi('/api/group', token, { op: 'load' }).then((res) =>
      setMode(res.error ? { status: 'error', message: res.error.message } : { status: res.data.access === 'edit' ? 'edit' : 'view' }),
    )
  }, [token])

  if (mode.status === 'loading') return <div className="boot"><div className="spinner" /></div>
  if (mode.status === 'error') return <BrokenLink message={mode.message} />
  if (mode.status === 'edit') return <SharedEditor token={token} onChange={setMode} />
  return <SharedViewer token={token} onEdit={() => setMode({ status: 'edit' })} />
}

/** A view link: read-only table and details. */
function SharedViewer({ token, onEdit }) {
  const [state, setState] = useState({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState(null)
  const [groupId, setGroupId] = useState(null)
  const deferredQuery = useDeferredValue(query)
  const today = localToday()

  useEffect(() => {
    let cancelled = false
    const load = () =>
      callShareApi('/api/group', token, { op: 'load' }).then((res) => {
        if (cancelled) return
        // Keep showing what we have if a background refresh fails.
        // The owner upgraded the link: switch to the editor.
        if (res.data?.access === 'edit') return onEdit()
        setState((prev) => (res.error ? (prev.status === 'ready' ? prev : { status: 'error', message: res.error.message }) : { status: 'ready', data: res.data }))
      })
    load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [token, onEdit])

  const data = state.data
  const groups = useMemo(() => data?.groups ?? [], [data])
  const group = groups.find((g) => g.id === groupId) ?? (groups.length === 1 ? groups[0] : null)
  const all = useMemo(() => data?.competitions ?? [], [data])
  const comps = useMemo(() => (groupId ? all.filter((c) => c.group_ids?.includes(groupId)) : all), [all, groupId])
  const optionsById = useMemo(() => byId(data?.options ?? []), [data])
  const projectsById = useMemo(() => byId(data?.projects ?? []), [data])
  const index = useMemo(() => buildIndex(comps, optionsById, projectsById), [comps, optionsById, projectsById])
  const timelines = useMemo(() => Object.fromEntries(comps.map((c) => [c.id, timelineState(c.timeline, today)])), [comps, today])
  const results = useMemo(() => {
    const hits = searchCompetitions(index, deferredQuery, { today })
    return parseQuery(deferredQuery).terms.length ? hits : sortCompetitions(hits, 'deadline', today, (r) => r.comp)
  }, [index, deferredQuery, today])

  useEffect(() => {
    if (data) document.title = `${group?.name ?? 'Shared competitions'} · Agenda`
  }, [data, group])

  if (state.status === 'loading') return <div className="boot"><div className="spinner" /></div>
  if (state.status === 'error') return <BrokenLink message={state.message} />

  const open = openId ? comps.find((c) => c.id === openId) : null
  return (
    <div className="shared-group">
      <div className="comps">
        <div className="comps-main">
          <header className="comps-head glass-tile">
            <div className="comps-title">
              <FolderOpen size={20} />
              <div>
                <h2>{group?.name ?? 'Shared competitions'}</h2>
                <p className="muted small">
                  {data.owner ? `Shared by ${data.owner}` : 'Shared competition group'} · {comps.length} competition{comps.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <label className="search comps-search">
              <Search size={17} />
              <input placeholder="Search name, item, stage…" value={query} aria-label="Search competitions" onChange={(e) => setQuery(e.target.value)} />
              {query && (
                <button className="icon-btn sm" onClick={() => setQuery('')} aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </label>
            <span className="view-only muted small">
              <Eye size={14} /> View only
            </span>
          </header>

          {groups.length > 1 && (
            <nav className="comp-groups" aria-label="Groups">
              <FolderOpen size={15} className="muted" aria-hidden="true" />
              <div className="chips" role="tablist">
                {[{ id: null, name: 'All shared' }, ...groups].map((g) => (
                  <button key={g.id ?? 'all'} role="tab" aria-selected={groupId === g.id} className={`chip group-chip ${groupId === g.id ? 'on' : ''}`} onClick={() => setGroupId(g.id)}>
                    {g.name}
                    <span className="chip-count">{g.id ? all.filter((c) => c.group_ids?.includes(g.id)).length : all.length}</span>
                  </button>
                ))}
              </div>
            </nav>
          )}

          <section className="comp-table-wrap glass-tile">
            <table className="comp-table full">
              <caption className="sr-only">Competitions in {group?.name ?? 'the shared groups'}</caption>
              <thead>
                <tr>
                  <th scope="col">Competition</th>
                  <th scope="col">Category</th>
                  <th scope="col">Prestige</th>
                  <th scope="col">Submission items</th>
                  <th scope="col">Timeline</th>
                  <th scope="col">Doing?</th>
                  <th scope="col">Next date</th>
                </tr>
              </thead>
              <tbody>
                {results.map(({ comp: c, highlight }) => {
                  const tl = timelines[c.id]
                  const items = (c.submission_items ?? []).map((id) => optionsById[id]).filter(Boolean)
                  const href = normalizeUrl(c.url)
                  return (
                    <tr
                      key={c.id}
                      className={`comp-row cc-${c.category} ${c.id === openId ? 'selected' : ''} ${tl.state === 'finished' || c.decision === 'no' ? 'finished' : ''} ${c.project_id ? 'doing' : ''}`}
                      onClick={() => setOpenId(c.id)}
                    >
                      <td className="c-name">
                        <span className="cat-edge" aria-hidden="true" />
                        <button className="comp-open" onClick={(e) => (e.stopPropagation(), setOpenId(c.id))}>
                          <span className="comp-title">{c.name ? <Highlight text={c.name} indices={highlight} /> : <span className="muted">Untitled competition</span>}</span>
                        </button>
                        <div className="comp-sub">
                          {href && (
                            <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="comp-link">
                              {hostOf(c.url)} <ExternalLink size={11} />
                            </a>
                          )}
                          {c.description && <span className="comp-desc">{notesPreview(c.description)}</span>}
                        </div>
                      </td>
                      <td className="c-cat" data-label="Category">
                        <CategoryPill id={c.category} />
                      </td>
                      <td className="c-prestige" data-label="Prestige">
                        <PrestigeMeter value={c.prestige} />
                      </td>
                      <td className="c-items" data-label="Submit">
                        <div className="item-chips">
                          {items.map((o) => (
                            <span key={o.id} className="item-chip">
                              {o.name}
                            </span>
                          ))}
                          {!items.length && <span className="muted small">—</span>}
                        </div>
                      </td>
                      <td className="c-timeline" data-label="Timeline">
                        <TimelineTrack tl={tl} today={today} />
                      </td>
                      <td className="c-doing" data-label="Doing?">
                        <DecisionBadge comp={c} projectsById={projectsById} undecided="Undecided" />
                      </td>
                      <td className="c-next" data-label="Next">
                        <Countdown days={tl.daysToNext} date={tl.next?.date} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!results.length && (
              <div className="comp-empty">
                <p>{comps.length ? `No competitions match “${query.trim()}”.` : 'This group is empty for now.'}</p>
              </div>
            )}
          </section>
        </div>
        {open && <ViewPanel key={open.id} comp={open} optionsById={optionsById} projectsById={projectsById} tl={timelines[open.id]} onClose={() => setOpenId(null)} />}
      </div>
    </div>
  )
}
