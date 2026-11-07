// Notes are stored as plain Markdown text (so old plain-text notes, the AI
// tools and exports keep working) and edited as Notion-style blocks.
//
// One line is one block. Supported: paragraphs, # / ## / ### headings,
// - bullets, 1. numbered items, - [ ] to-dos, > quotes, > [!💡] callouts,
// ``` code ```, $$ math $$ (TeX) and --- dividers. Lists, to-dos and paragraphs nest with two spaces per level.

export const BLOCK_TYPES = [
  { id: 'p', label: 'Text', hint: 'Plain text', keys: ['text', 'paragraph', 'plain'] },
  { id: 'h1', label: 'Heading 1', hint: 'Big section heading', md: '#', keys: ['heading', 'title', 'h1'] },
  { id: 'h2', label: 'Heading 2', hint: 'Medium section heading', md: '##', keys: ['heading', 'subtitle', 'h2'] },
  { id: 'h3', label: 'Heading 3', hint: 'Small section heading', md: '###', keys: ['heading', 'h3'] },
  { id: 'todo', label: 'To-do list', hint: 'Track tasks with a checkbox', md: '[]', keys: ['todo', 'task', 'checkbox', 'check'] },
  { id: 'bullet', label: 'Bulleted list', hint: 'A simple bulleted list', md: '-', keys: ['bullet', 'list', 'unordered', 'ul'] },
  { id: 'number', label: 'Numbered list', hint: 'A list with numbering', md: '1.', keys: ['number', 'numbered', 'ordered', 'ol', 'list'] },
  { id: 'quote', label: 'Quote', hint: 'Capture a quote', md: '>', keys: ['quote', 'blockquote', 'citation'] },
  { id: 'callout', label: 'Callout', hint: 'Make a note stand out', keys: ['callout', 'note', 'info', 'tip', 'warning', 'box', 'aside', 'highlight'] },
  { id: 'math', label: 'Math equation', hint: 'Write TeX, see it typeset', md: '$$', keys: ['math', 'equation', 'tex', 'latex', 'katex', 'formula'] },
  { id: 'code', label: 'Code', hint: 'A block of code', md: '```', keys: ['code', 'snippet', 'pre'] },
  { id: 'divider', label: 'Divider', hint: 'Separate sections', md: '---', keys: ['divider', 'line', 'separator', 'hr', 'rule'] },
]
export const typeLabel = (id) => BLOCK_TYPES.find((t) => t.id === id)?.label ?? 'Text'

/** Types that can nest under the block above them. */
export const INDENTABLE = new Set(['p', 'bullet', 'number', 'todo'])
export const MAX_INDENT = 3
/** Enter on one of these keeps going with the same type. */
export const CONTINUES = new Set(['bullet', 'number', 'todo'])

/** Callout icons; clicking a callout's icon steps through them. */
export const CALLOUT_ICONS = ['💡', '⚠️', '📌', '✅', '❗', '🔥', '📝', '🧠']

let seq = 0
export const newBlock = (type = 'p', text = '', extra = {}) => ({ id: `nb${++seq}`, type, text, indent: 0, checked: false, ...extra })

// Text that would read back as a marker gets a backslash, so a paragraph that
// happens to start with "- " stays a paragraph.
const MARKER = /^(#{1,3} |[-*+] |\d+[.)] |> |```|\$\$|---\s*$|\[[ xX]?\] |\\)/

/** Markdown text → blocks. Never returns an empty list. */
export function parseNotes(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const fence = raw.match(/^\s*```(.*)$/)
    if (fence) {
      const body = []
      let j = i + 1
      while (j < lines.length && !/^\s*```\s*$/.test(lines[j])) body.push(lines[j++])
      out.push(newBlock('code', body.join('\n'), { lang: fence[1].trim() }))
      i = j
      continue
    }
    // $$ on its own line opens a math block (TeX) that runs to the next $$; $$x$$ is a one-line one.
    const inline = raw.match(/^\s*\$\$(.+)\$\$\s*$/)
    if (inline) {
      out.push(newBlock('math', inline[1].trim()))
      continue
    }
    if (/^\s*\$\$\s*$/.test(raw)) {
      const body = []
      let j = i + 1
      while (j < lines.length && !/^\s*\$\$\s*$/.test(lines[j])) body.push(lines[j++])
      out.push(newBlock('math', body.join('\n').trim()))
      i = j
      continue
    }
    const lead = raw.match(/^ */)[0].length
    const indent = Math.min(Math.floor(lead / 2), MAX_INDENT)
    const line = raw.slice(lead)
    let m
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) out.push(newBlock('divider'))
    else if ((m = line.match(/^(#{1,3}) (.*)$/))) out.push(newBlock(`h${m[1].length}`, m[2]))
    else if ((m = line.match(/^[-*+] \[([ xX]?)\] ?(.*)$/)) || (m = line.match(/^\[([ xX]?)\] ?(.*)$/)))
      out.push(newBlock('todo', m[2], { indent, checked: m[1].toLowerCase() === 'x' }))
    else if ((m = line.match(/^[-*+] (.*)$/))) out.push(newBlock('bullet', m[1], { indent }))
    else if ((m = line.match(/^\d+[.)] (.*)$/))) out.push(newBlock('number', m[1], { indent }))
    else if ((m = line.match(/^> ?\[!([^\]\s]{1,8})\] ?(.*)$/))) out.push(newBlock('callout', m[2], { icon: m[1] }))
    else if ((m = line.match(/^> ?(.*)$/))) out.push(newBlock('quote', m[1]))
    else out.push(newBlock('p', line.startsWith('\\') ? line.slice(1) : line, { indent }))
  }
  // A trailing newline isn't an empty block worth keeping (except the only one).
  if (out.length > 1 && out.at(-1).type === 'p' && !out.at(-1).text) out.pop()
  return out.length ? out : [newBlock()]
}

/** Blocks → Markdown text. An empty document is ''. */
export function serializeNotes(blocks) {
  const lines = []
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    const pad = '  '.repeat(INDENTABLE.has(b.type) ? b.indent : 0)
    switch (b.type) {
      case 'h1':
      case 'h2':
      case 'h3':
        lines.push(`${'#'.repeat(Number(b.type[1]))} ${b.text}`)
        break
      case 'todo':
        lines.push(`${pad}- [${b.checked ? 'x' : ' '}] ${b.text}`)
        break
      case 'bullet':
        lines.push(`${pad}- ${b.text}`)
        break
      case 'number':
        lines.push(`${pad}${numberAt(blocks, i)}. ${b.text}`)
        break
      case 'quote':
        lines.push(`> ${b.text}`)
        break
      case 'callout':
        lines.push(`> [!${b.icon || CALLOUT_ICONS[0]}] ${b.text}`)
        break
      case 'code':
        lines.push(`\`\`\`${b.lang ?? ''}`, ...b.text.split('\n'), '```')
        break
      case 'math':
        lines.push('$$', ...(b.text ? b.text.split('\n') : []), '$$')
        break
      case 'divider':
        lines.push('---')
        break
      default:
        lines.push(pad + (MARKER.test(b.text) ? `\\${b.text}` : b.text))
    }
  }
  return lines.join('\n').replace(/\s+$/, '')
}

/** 1-based position of a numbered item within its run (same indent, nested items don't break it). */
export function numberAt(blocks, i) {
  const { indent } = blocks[i]
  let n = 1
  for (let j = i - 1; j >= 0; j--) {
    const b = blocks[j]
    if (b.indent > indent && INDENTABLE.has(b.type)) continue
    if (b.type !== 'number' || b.indent !== indent) break
    n++
  }
  return n
}

/** Markdown shortcut typed at the start of a paragraph ("# ", "- ", "[] " …) → the block it becomes. */
export function shortcutFor(text) {
  const rules = [
    [/^# /, 'h1'],
    [/^## /, 'h2'],
    [/^### /, 'h3'],
    [/^\[[ xX]?\] /, 'todo'],
    [/^[-*+] \[[ xX]?\] /, 'todo'],
    [/^[-*+] /, 'bullet'],
    [/^1[.)] /, 'number'],
    [/^> /, 'quote'],
    [/^```$/, 'code'],
    [/^\$\$$/, 'math'],
    [/^---$/, 'divider'],
  ]
  for (const [re, type] of rules) {
    const m = text.match(re)
    if (m) return { type, rest: text.slice(m[0].length), checked: /\[[xX]\]/.test(m[0]) }
  }
  return null
}

/** Slash-menu matches for what's typed after "/". */
export function matchTypes(query) {
  const q = query.trim().toLowerCase()
  if (!q) return BLOCK_TYPES
  return BLOCK_TYPES.filter((t) => t.label.toLowerCase().includes(q) || t.keys.some((k) => k.startsWith(q)) || t.md === q)
}

/** One-line-per-block plain text for small previews (calendar cards, list rows). */
export function notesPreview(text) {
  return parseNotes(text)
    .filter((b) => b.type !== 'divider' && b.text.trim())
    .map((b, i, all) => {
      const pad = INDENTABLE.has(b.type) ? '  '.repeat(b.indent) : ''
      if (b.type === 'todo') return `${pad}${b.checked ? '☑' : '☐'} ${b.text}`
      if (b.type === 'bullet') return `${pad}• ${b.text}`
      if (b.type === 'number') return `${pad}${numberAt(all, i)}. ${b.text}`
      if (b.type === 'callout') return `${b.icon || CALLOUT_ICONS[0]} ${b.text}`
      return pad + b.text
    })
    .join('\n')
}
