import { useEffect } from 'react'
import { X } from 'lucide-react'
import { usePref } from '../lib/prefs'

const SHIFT = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '') ? '⇧' : 'Shift'

export default function SettingsModal({ onClose }) {
  const [shiftToCreate, setShiftToCreate] = usePref('shiftToCreate', false)
  const [blockStyle, setBlockStyle] = usePref('blockStyle', 'clear')

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal-head">
          <h2 id="settings-title">Settings</h2>
          <button className="icon-btn sm" onClick={onClose} aria-label="Close settings">
            <X size={16} />
          </button>
        </div>
        <div className="menu-label">Calendar</div>
        <label className="toggle-row">
          <span>
            <strong>{SHIFT}-click to add blocks</strong>
            <small>
              {shiftToCreate
                ? `Hold ${SHIFT} and click or drag on the grid to add a block. Plain clicks do nothing.`
                : 'Click or drag on an empty spot in the grid to add a block.'}
            </small>
          </span>
          <input type="checkbox" className="switch" checked={shiftToCreate} onChange={(e) => setShiftToCreate(e.target.checked)} />
        </label>
        <div className="toggle-row setting-row">
          <span>
            <strong>Block style</strong>
            <small>{blockStyle === 'solid' ? 'Opaque cards tinted by status.' : 'See-through, tinted by category.'}</small>
          </span>
          <div className="segmented small" role="radiogroup" aria-label="Block style">
            {[['clear', 'Transparent'], ['solid', 'Solid']].map(([id, label]) => (
              <button key={id} role="radio" aria-checked={blockStyle === id} className={blockStyle === id ? 'on' : ''} onClick={() => setBlockStyle(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
