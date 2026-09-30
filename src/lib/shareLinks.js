/** Random URL-safe token (24 bytes → 32 chars) for share, booking and widget links. */
export function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Public URL of an edit or booking link. */
export function linkUrl(link) {
  return `${window.location.origin}/${link.kind === 'edit' ? 's' : 'b'}/${link.token}`
}

/**
 * Build the standalone Notion widget file for a widget link: the prebuilt
 * template with the Supabase URL, anon key and widget token filled in.
 */
export async function buildWidgetFile(link, { url, key }) {
  const res = await fetch('/widget-template.html', { cache: 'no-store' })
  if (!res.ok) throw new Error('Widget template not found — run `npm run build:widget`.')
  const template = await res.text()
  const config = JSON.stringify({ url, key, token: link.token }).replace(/</g, '\\u003c')
  // Built in pieces so this code (which is bundled into the widget too) never contains the marker itself.
  const marker = ['null /*', 'VAPOR_WIDGET_CONFIG', '*/'].join('')
  const html = template.replace(marker, config)
  if (html === template) throw new Error('Widget template is out of date — run `npm run build:widget`.')
  return new Blob([html], { type: 'text/html' })
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
