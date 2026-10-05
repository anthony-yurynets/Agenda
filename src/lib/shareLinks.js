/** Random URL-safe token (24 bytes → 32 chars) for share, booking and widget links. */
export function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const ROUTE_PREFIX = { edit: 's', booking: 'b', group: 'g' }

/** Public URL of an edit, booking or competition-group link. */
export function linkUrl(link) {
  return `${window.location.origin}/${ROUTE_PREFIX[link.kind] ?? 's'}/${link.token}`
}

/** The hosted widget page for a widget link. `base` is your deployed site. */
export const widgetUrl = (link, base = window.location.origin) => `${base.replace(/\/+$/, '')}/widget.html#t=${link.token}`

/**
 * vapor-widget.html: a tiny page that frames the hosted widget. (Notion's HTML
 * blocks can't talk to Supabase directly — their security policy only allows
 * a few CDNs — so the calendar itself has to live on your site.)
 */
export function widgetWrapperFile(url) {
  const safe = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Vapor</title>
<style>
  html, body { margin: 0; height: 100%; background: transparent; }
  iframe { display: block; width: 100%; height: 100%; border: 0; }
</style>
</head>
<body>
<iframe src="${safe}" title="Vapor calendar" allow="clipboard-write"></iframe>
</body>
</html>
`
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
