// User settings kept in localStorage and shared live across components.
import { useEffect, useState } from 'react'

const EVENT = 'agenda:pref'

export function getPref(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(`agenda:${key}`)) ?? fallback
  } catch {
    return fallback
  }
}

export function setPref(key, value) {
  try {
    localStorage.setItem(`agenda:${key}`, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { key, value } }))
}

/** [value, setValue] for one setting; every user of the key re-renders on change. */
export function usePref(key, fallback) {
  const [value, setValue] = useState(() => getPref(key, fallback))
  useEffect(() => {
    const onChange = (e) => e.detail.key === key && setValue(e.detail.value)
    window.addEventListener(EVENT, onChange)
    return () => window.removeEventListener(EVENT, onChange)
  }, [key])
  return [value, (v) => setPref(key, v)]
}
