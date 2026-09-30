import { useEffect, useState } from 'react'
import { Check, Copy, Download, KeyRound, LayoutPanelTop, Plus, ShieldCheck, Trash2, Wrench } from 'lucide-react'
import { downloadBlob, generateToken as shareToken, widgetUrl, widgetWrapperFile } from '../lib/shareLinks'
import LinkList from './LinkList'
import { supabase } from '../lib/supabase'
import { format } from '../lib/dates'

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `vpr_${b64}`
}

const TOOL_LIST = [
  ['list_blocks', 'Read your schedule for any date range'],
  ['create_block', 'Add blocks, with sub-blocks and repeats'],
  ['update_block', 'Edit one block, one occurrence, or a whole series'],
  ['divide_block', 'Split a block into equal parts'],
  ['delete_block', 'Remove a block and its sub-blocks'],
  ['list_categories', 'See (and create) categories'],
]

export default function Integrations({ toast }) {
  const [tokens, setTokens] = useState([])
  const [name, setName] = useState('')
  const [fresh, setFresh] = useState(null)
  const [busy, setBusy] = useState(false)
  const endpoint = `${window.location.origin}/api/mcp`

  useEffect(() => {
    supabase
      .from('api_tokens')
      .select('id, name, token_prefix, created_at, last_used_at')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => (error ? toast(error.message, 'error') : setTokens(data)))
  }, [toast])

  const create = async (e) => {
    e.preventDefault()
    setBusy(true)
    const token = generateToken()
    const row = { name: name.trim() || 'My assistant', token_hash: await sha256Hex(token), token_prefix: token.slice(0, 10) }
    const { data, error } = await supabase
      .from('api_tokens')
      .insert(row)
      .select('id, name, token_prefix, created_at, last_used_at')
      .single()
    setBusy(false)
    if (error) return toast(error.message, 'error')
    setTokens((t) => [data, ...t])
    setFresh(token)
    setName('')
  }

  const revoke = async (id) => {
    const prev = tokens
    setTokens((t) => t.filter((x) => x.id !== id))
    const { error } = await supabase.from('api_tokens').delete().eq('id', id)
    if (error) {
      setTokens(prev)
      toast(error.message, 'error')
    } else toast('Token revoked')
  }

  const shown = fresh ?? '<YOUR_TOKEN>'
  const snippets = {
    'Claude Code': `claude mcp add --transport http vapor ${endpoint} \\\n  --header "Authorization: Bearer ${shown}"`,
    'Claude Desktop': JSON.stringify(
      {
        mcpServers: {
          vapor: {
            command: 'npx',
            args: ['-y', 'mcp-remote', endpoint, '--header', 'Authorization:Bearer ${VAPOR_TOKEN}'],
            env: { VAPOR_TOKEN: shown },
          },
        },
      },
      null,
      2,
    ),
    'Other clients': `URL:     ${endpoint}\nHeader:  Authorization: Bearer ${shown}\nTransport: Streamable HTTP`,
  }

  return (
    <div className="integrations">
      <section className="panel int-hero">
        <div>
          <h2>MCP server</h2>
          <p className="muted">
            Any MCP client (Claude Code, Claude Desktop, …) can read and edit your blocks with a token. Changes appear
            here as they happen.
          </p>
        </div>
        <div className="endpoint">
          <span className="field-label">Server URL</span>
          <CopyField value={endpoint} />
        </div>
      </section>

      <NotionWidget toast={toast} />

      <div className="int-grid">
        <section className="panel">
          <h3><KeyRound size={17} /> Access tokens</h3>
          <p className="muted small">Each token gives full access to your blocks. Only its hash is stored.</p>
          <form className="token-form" onSubmit={create}>
            <input placeholder="Token name, e.g. Claude Desktop" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            <button className="btn primary" disabled={busy}>
              <Plus size={16} /> Create
            </button>
          </form>

          {fresh && (
            <div className="fresh-token">
              <div className="fresh-head">
                <ShieldCheck size={16} /> Copy this token now — it won’t be shown again.
              </div>
              <CopyField value={fresh} mono />
            </div>
          )}

          <ul className="token-list">
            {tokens.length === 0 && <li className="muted small">No tokens yet.</li>}
            {tokens.map((t) => (
              <li key={t.id}>
                <div>
                  <strong>{t.name}</strong>
                  <small className="muted">
                    <code>{t.token_prefix}…</code> · created {format(new Date(t.created_at), 'MMM d')} ·{' '}
                    {t.last_used_at ? `last used ${format(new Date(t.last_used_at), 'MMM d, HH:mm')}` : 'never used'}
                  </small>
                </div>
                <button className="btn ghost danger sm" onClick={() => revoke(t.id)}>
                  <Trash2 size={14} /> Revoke
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h3><Wrench size={17} /> Tools</h3>
          <ul className="tool-list">
            {TOOL_LIST.map(([n, d]) => (
              <li key={n}>
                <code>{n}</code>
                <span>{d}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">
            Try: “Plan tomorrow 9–12 as deep work on the report, divided into outline, draft and review.”
          </p>
        </section>
      </div>

      <section className="panel">
        <h3>Connect a client</h3>
        <Snippets snippets={snippets} />
      </section>
    </div>
  )
}

function Snippets({ snippets }) {
  const keys = Object.keys(snippets)
  const [tab, setTab] = useState(keys[0])
  return (
    <div className="snippets">
      <div className="segmented small">
        {keys.map((k) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {k}
          </button>
        ))}
      </div>
      <CopyField value={snippets[tab]} mono block />
    </div>
  )
}

function CopyField({ value, mono, block }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked */
    }
  }
  return (
    <div className={`copy-field ${block ? 'multiline' : ''}`}>
      {block ? <pre className="mono">{value}</pre> : <span className={mono ? 'mono' : ''}>{value}</span>}
      <button className="icon-btn sm" onClick={copy} aria-label="Copy">
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  )
}

// Where the widget page lives. Notion can't reach localhost, so links made while
// developing locally still point at the deployed site.
const SITE_URL = 'https://vapor.anthonyy.me'
const widgetBase = () => (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname) ? SITE_URL : window.location.origin)

/** Notion widget links. Each works like a private edit link, used by /widget.html. */
function NotionWidget({ toast }) {
  const [links, setLinks] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase
      .from('share_links')
      .select('*')
      .eq('kind', 'embed')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) toast(/share_links/.test(error.message) ? 'Run the sharing migrations (0004, 0006) to enable the widget.' : error.message, 'error')
        setLinks(data ?? [])
      })
  }, [toast])

  const copyLink = async (link) => {
    try {
      await navigator.clipboard.writeText(widgetUrl(link, widgetBase()))
      toast('Embed link copied — paste it into a Notion /embed block')
    } catch {
      toast('Couldn’t copy the link', 'error')
    }
  }

  const download = (link) => {
    downloadBlob(widgetWrapperFile(widgetUrl(link, widgetBase())), 'vapor-widget.html')
    toast('vapor-widget.html downloaded — add it to your Notion page')
  }

  const create = async () => {
    setBusy(true)
    const { data, error } = await supabase
      .from('share_links')
      .insert({ kind: 'embed', name: 'Notion widget', token: shareToken(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
      .select('*')
      .single()
    setBusy(false)
    if (error) return toast(/kind_check/.test(error.message) ? 'Run supabase/migrations/0006_widget_links.sql first.' : error.message, 'error')
    setLinks((l) => [data, ...(l ?? [])])
    copyLink(data)
  }

  const revoke = async (id) => {
    const prev = links
    setLinks((l) => l.filter((x) => x.id !== id))
    const { error } = await supabase.from('share_links').delete().eq('id', id)
    if (error) {
      setLinks(prev)
      toast(error.message, 'error')
    } else toast('Widget turned off')
  }

  return (
    <section className="panel">
      <h3>
        <LayoutPanelTop size={17} /> Notion widget
      </h3>
      <p className="muted small">
        Your full calendar inside a Notion page. Create a widget, then in Notion type <code>/embed</code> and paste the
        link, or add the downloaded <code>vapor-widget.html</code> file. It opens without signing in, so keep that page
        private. Served from <code>{widgetBase()}</code>.
      </p>
      <div className="token-form">
        <button className="btn primary" onClick={create} disabled={busy}>
          <Plus size={16} /> Create widget
        </button>
      </div>
      <LinkList
        links={links ?? []}
        loading={!links}
        onRevoke={revoke}
        empty="No widgets yet."
        actions={[
          { label: 'Copy embed link', icon: <Copy size={14} />, onClick: copyLink },
          { label: 'Download .html', icon: <Download size={14} />, onClick: download },
        ]}
      />
    </section>
  )
}
