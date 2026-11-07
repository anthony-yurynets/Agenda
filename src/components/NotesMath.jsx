import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Sigma } from 'lucide-react'

// KaTeX is only fetched once a note actually has math in it.
let katexPromise = null
const loadKatex = () => (katexPromise ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => m.default))

function useKatex() {
  const [katex, setKatex] = useState(null)
  useEffect(() => {
    let live = true
    loadKatex().then((k) => live && setKatex(() => k))
    return () => {
      live = false
    }
  }, [])
  return katex
}

/** TeX → typeset HTML, or the parse error. */
function render(katex, tex) {
  try {
    return { html: katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: 'ignore', trust: false }) }
  } catch (e) {
    return { error: String(e.message || e).replace(/^KaTeX parse error: /, '') }
  }
}

function Typeset({ tex, className }) {
  const katex = useKatex()
  if (!tex.trim()) return null
  if (!katex) return <code className={className}>{tex}</code>
  const out = render(katex, tex)
  if (out.error) return <span className={`${className} nb-math-err`}>{out.error}</span>
  return <div className={className} dangerouslySetInnerHTML={{ __html: out.html }} />
}

/** A math block in the notes: the typeset equation. Click (or Enter) to edit its TeX. */
export function MathBlock({ tex, readOnly, onOpen, ...rest }) {
  return (
    <div
      className={`nb-eq ${tex.trim() ? '' : 'nb-eq-empty'}`}
      tabIndex={readOnly ? -1 : 0}
      role={readOnly ? undefined : 'button'}
      aria-label={readOnly ? undefined : tex.trim() ? `Equation: ${tex}. Press Enter to edit` : 'Empty equation. Press Enter to add one'}
      onClick={readOnly ? undefined : onOpen}
      {...rest}
    >
      {tex.trim() ? (
        <Typeset tex={tex} className="nb-math-out" />
      ) : (
        <span className="nb-math-ph">
          <Sigma size={15} /> Add a TeX equation
        </span>
      )}
    </div>
  )
}

/**
 * The little TeX box that pops up over a math block, with a live preview.
 * Enter (or Done) keeps it, Shift+Enter is a new line, Escape puts it back.
 * Portaled so a scrolling notes panel can't clip it.
 */
export function MathEditor({ anchor, initial, onDone, onCancel }) {
  const [draft, setDraft] = useState(initial)
  const [pos, setPos] = useState(null)
  const boxRef = useRef(null)
  const inputRef = useRef(null)
  const latest = useRef({ draft, onDone })
  useLayoutEffect(() => {
    latest.current = { draft, onDone }
  })

  useLayoutEffect(() => {
    const place = () => {
      const a = anchor()?.getBoundingClientRect()
      const box = boxRef.current
      if (!a || !box) return
      const h = box.offsetHeight
      const w = Math.min(440, window.innerWidth - 24)
      const left = Math.max(12, Math.min(a.left, window.innerWidth - w - 12))
      // Above the line when it fits, otherwise below it.
      const top = a.top - h - 8 >= 8 ? a.top - h - 8 : Math.min(a.bottom + 8, window.innerHeight - h - 8)
      setPos((p) => (p && p.top === top && p.left === left && p.w === w ? p : { top, left, w }))
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    const ro = new ResizeObserver(place)
    if (boxRef.current) ro.observe(boxRef.current)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      ro.disconnect()
    }
  }, [anchor])

  useEffect(() => {
    const el = inputRef.current
    el?.focus()
    el?.setSelectionRange(el.value.length, el.value.length)
    // Clicking away keeps what was typed, like Done.
    const away = (e) => !boxRef.current?.contains(e.target) && latest.current.onDone(latest.current.draft, false)
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [])

  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [draft])

  const onKey = (e) => {
    // Keep page shortcuts away from the box.
    e.stopPropagation()
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onDone(draft, true)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return createPortal(
    <div
      ref={boxRef}
      className="nb-math-editor"
      role="dialog"
      aria-label="Edit equation"
      style={pos ? { top: pos.top, left: pos.left, width: pos.w } : { opacity: 0, top: 0, left: 0 }}
    >
      <div className="nb-math-row">
        <textarea
          ref={inputRef}
          className="nb-math-input"
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder="\frac{-b \pm \sqrt{b^2-4ac}}{2a}"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="TeX"
        />
        <button type="button" className="btn primary sm" onClick={() => onDone(draft, true)}>
          Done <kbd>↵</kbd>
        </button>
      </div>
      <div className="nb-math-preview" aria-live="polite">
        {draft.trim() ? <Typeset tex={draft} className="nb-math-out" /> : <span className="muted small">The typeset equation shows here as you type.</span>}
      </div>
    </div>,
    document.body,
  )
}
