// Files page: uploads only one account can manage, each opened by its own link.

/** The only account that sees the Files page (also enforced in 0018_shared_files.sql). */
export const FILES_OWNER = 'toha.yurynets@gmail.com'
export const FILES_BUCKET = 'shared-files'

export const canUseFiles = (session) => session?.user?.email?.toLowerCase() === FILES_OWNER

/** Public URL that opens one file. */
export const fileUrl = (file) => `${window.location.origin}/f/${file.token}`

const ext = (name) => /\.([\w]+)$/.exec(name ?? '')?.[1]?.toLowerCase() ?? ''
const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'log', 'tex',
  'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt',
  'sh', 'zsh', 'sql', 'css', 'scss', 'html', 'htm', 'svg',
])

/** Which viewer opens a file: pdf, image, video, audio, text, or other (download only). */
export function fileKind({ mime = '', name = '' }) {
  const e = ext(name)
  if (mime === 'application/pdf' || e === 'pdf') return 'pdf'
  // SVG is shown as text: rendering it inline could run scripts.
  if (e === 'svg' || mime === 'image/svg+xml') return 'text'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('text/') || mime === 'application/json' || TEXT_EXTS.has(e)) return 'text'
  return 'other'
}

export function formatSize(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const n = bytes / 1024 ** i
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`
}

/** Storage key for an upload: <user>/<file id>/<safe name>. The real name lives in the table. */
export function storagePath(userId, id, name) {
  const safe = name.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(-120) || 'file'
  return `${userId}/${id}/${safe}`
}
