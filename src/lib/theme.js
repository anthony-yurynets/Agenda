// Theme preference: 'system' | 'light' | 'dark'. The resolved value lives on
// <html data-theme>, set before first paint by the inline script in index.html.
const KEY = 'vapor:theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')

export function getThemePref() {
  try {
    return localStorage.getItem(KEY) || 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(pref) {
  const resolved = pref === 'system' ? (media.matches ? 'dark' : 'light') : pref
  document.documentElement.dataset.theme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0e1116' : '#e7eaee')
}

export function setThemePref(pref) {
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    /* storage unavailable */
  }
  applyTheme(pref)
}

media.addEventListener('change', () => getThemePref() === 'system' && applyTheme('system'))
