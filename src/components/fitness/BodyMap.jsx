import { useMemo, useState } from 'react'
import Body from 'react-muscle-highlighter'
import { LEVELS, MUSCLE_BY_ID, muscleLabel } from '../../lib/fitness'

// Level colors come from CSS variables (see .body-map in index.css), so the
// map follows the app's palette and light/dark theme. The library applies
// fills through inline styles, where var() works.
const LEVEL_COLORS = ['var(--rec-1)', 'var(--rec-2)', 'var(--rec-3)', 'var(--rec-4)']
const NON_MUSCLE = ['hair', 'head', 'hands', 'feet', 'ankles', 'knees']

function since(iso) {
  if (!iso) return 'not trained recently'
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (h < 1) return 'trained just now'
  if (h < 36) return `trained ${h}h ago`
  return `trained ${Math.round(h / 24)} days ago`
}

/** The male body, colored by how recovered each muscle is right now. */
export default function BodyMap({ rec, selected, onSelect }) {
  const [side, setSide] = useState('front')

  // Every part gets an explicit fill: the library ignores `defaultFill` and
  // hardcodes colors for head/hands/feet, which would clash with the theme.
  const data = useMemo(
    () => [
      ...Object.entries(rec).map(([slug, r]) => ({
        slug,
        styles: {
          fill: r.level > 0 ? LEVEL_COLORS[r.level - 1] : 'var(--rec-0)',
          ...(slug === selected ? { stroke: 'var(--ink)', strokeWidth: 2 } : {}),
        },
      })),
      ...NON_MUSCLE.map((slug) => ({ slug, styles: { fill: 'var(--body-skin)' } })),
    ],
    [rec, selected],
  )

  const sel = selected && rec[selected]
  const level = sel ? LEVELS[sel.level] : null

  return (
    <div className="body-map">
      <div className="tile-head">
        <h3>Recovery</h3>
        <div className="segmented small" role="tablist">
          {['front', 'back'].map((s) => (
            <button key={s} role="tab" aria-selected={side === s} className={side === s ? 'on' : ''} onClick={() => setSide(s)}>
              {s === 'front' ? 'Front' : 'Back'}
            </button>
          ))}
        </div>
      </div>

      <div className="body-figure">
        <Body
          data={data}
          side={side}
          gender="male"
          colors={LEVEL_COLORS}
          defaultFill="var(--rec-0)"
          border="none"
          hiddenParts={['hair']}
          onBodyPartPress={(part) => part.slug && MUSCLE_BY_ID[part.slug] && onSelect(part.slug === selected ? null : part.slug)}
        />
      </div>

      <div className="body-detail" aria-live="polite">
        {sel ? (
          <>
            <strong>{muscleLabel(selected)}</strong>
            <span className={`rec-pill rec-${sel.level}`}>{level.label}</span>
            <span className="muted small">
              {since(sel.lastTrained)}
              {sel.hoursToFresh > 0 && ` · fresh in ~${sel.hoursToFresh < 36 ? `${sel.hoursToFresh}h` : `${Math.round(sel.hoursToFresh / 24)}d`}`}
            </span>
          </>
        ) : (
          <span className="muted small">Tap a muscle to see how recovered it is.</span>
        )}
      </div>

      <div className="rec-legend">
        {LEVELS.map((l) => (
          <span key={l.id}>
            <i className={`rec-${l.id}`} /> {l.label}
          </span>
        ))}
      </div>
    </div>
  )
}
