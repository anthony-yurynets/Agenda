import { createPortal } from 'react-dom'
import { categoryLabel, countdownLabel, fmtDate, hostOf, prestigeTier } from '../../lib/competitions'

const DATE_OPTS = { month: 'short', day: 'numeric', year: 'numeric' }

/**
 * Print-only spreadsheet of the competitions we're doing. Rendered straight into
 * <body> so print CSS can hide the rest of the app and show just this table.
 */
export default function PrintSheet({ rows, timelines, store, title }) {
  return createPortal(
    <div className="print-sheet" aria-hidden="true">
      <h1>{title}</h1>
      <p className="ps-meta">
        {rows.length} competition{rows.length === 1 ? '' : 's'} · printed {fmtDate(new Date().toISOString().slice(0, 10), DATE_OPTS)}
      </p>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Competition</th>
            <th>Category</th>
            <th>Project</th>
            <th>Prestige</th>
            <th>Next stage</th>
            <th>Timeline</th>
            <th>Submission items</th>
            <th>Website</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const c = r.comp
            const tl = timelines[c.id]
            const tier = prestigeTier(c.prestige)
            const items = (c.submission_items ?? []).map((id) => store.optionsById[id]?.name).filter(Boolean)
            return (
              <tr key={c.id} className={tl.state === 'finished' ? 'done' : ''}>
                <td>{i + 1}</td>
                <td className="ps-name">{c.name || 'Untitled competition'}</td>
                <td>{categoryLabel(c.category)}</td>
                <td>{store.projectsById[c.project_id]?.name ?? ''}</td>
                <td>{c.prestige ? `${c.prestige}/10${tier ? ` · ${tier.label}` : ''}` : ''}</td>
                <td>
                  {tl.state === 'finished'
                    ? 'All stages done'
                    : tl.next
                      ? `${tl.next.label || `Stage ${tl.next.index + 1}`} — ${fmtDate(tl.next.date, DATE_OPTS)} (${countdownLabel(tl.daysToNext)})`
                      : 'No dates yet'}
                </td>
                <td>
                  {tl.stages.map((s) => (
                    <div key={s.index}>
                      {fmtDate(s.date)}
                      {s.end && s.end !== s.date ? `–${fmtDate(s.end)}` : ''}: {s.label || `Stage ${s.index + 1}`}
                    </div>
                  ))}
                </td>
                <td>{items.join(', ')}</td>
                <td>{hostOf(c.url)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>,
    document.body,
  )
}
