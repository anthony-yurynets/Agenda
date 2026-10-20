import { useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { getThemePref, setThemePref } from '../lib/theme'

/** Light / Dark / System. */
export default function ThemeSwitch({ className = 'theme-switch' }) {
  const [pref, setPref] = useState(getThemePref)
  const options = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Monitor },
  ]
  return (
    <div className={className} role="radiogroup" aria-label="Theme">
      {options.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          role="radio"
          aria-checked={pref === id}
          className={pref === id ? 'on' : ''}
          onClick={() => {
            setThemePref(id)
            setPref(id)
          }}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
    </div>
  )
}
