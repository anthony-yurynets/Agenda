import { useState } from 'react'
import { Check, Link2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { hostOf, normalizeUrl } from '../../lib/competitions'
import { faviconUrl } from '../../lib/dashboard'

function Favicon({ host, title }) {
  const [failed, setFailed] = useState(false)
  const letter = (title || host || '?').trim()[0]?.toUpperCase() ?? '?'
  return (
    <span className="ql-icon" aria-hidden="true">
      {host && !failed ? <img src={faviconUrl(host)} alt="" loading="lazy" onError={() => setFailed(true)} /> : letter}
    </span>
  )
}

/** Quick links: favicon tiles. Add with a URL (name optional); Edit to rename or remove. */
export default function QuickLinks({ dash }) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')

  const add = (e) => {
    e.preventDefault()
    const href = normalizeUrl(url)
    if (!hostOf(href)) return
    dash.createLink({ url: href.slice(0, 2000), title: title.trim().slice(0, 80) })
    setUrl('')
    setTitle('')
    e.currentTarget.querySelector('input')?.focus()
  }

  return (
    <div className="tile-inner">
      <div className="tile-head">
        <h3>Quick links</h3>
        {dash.links.length > 0 && (
          <button className={`btn ghost sm ${editing ? 'is-active' : ''}`} onClick={() => setEditing((v) => !v)} aria-pressed={editing}>
            {editing ? <Check size={13} /> : <Pencil size={13} />} {editing ? 'Done' : 'Edit'}
          </button>
        )}
        {!adding && (
          <button className="btn ghost sm" onClick={() => setAdding(true)}>
            <Plus size={13} /> Add
          </button>
        )}
      </div>

      {adding && (
        <form className="ql-add" onSubmit={add} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setAdding(false))}>
          <input autoFocus placeholder="Link (e.g. classroom.google.com)" value={url} maxLength={2000} onChange={(e) => setUrl(e.target.value)} aria-label="Link URL" />
          <input placeholder="Name (optional)" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} aria-label="Link name" />
          <button className="btn primary sm" disabled={!hostOf(normalizeUrl(url))}>
            Add
          </button>
          <button type="button" className="icon-btn sm" onClick={() => setAdding(false)} aria-label="Stop adding links">
            <X size={14} />
          </button>
        </form>
      )}

      {dash.links.length === 0 && !adding ? (
        <div className="dash-empty">
          <Link2 size={20} />
          <p>Keep the sites you open every day one click away.</p>
          <button className="btn ghost sm" onClick={() => setAdding(true)}>
            <Plus size={13} /> Add a link
          </button>
        </div>
      ) : (
        <ul className="ql-grid">
          {dash.links.map((l) => {
            const host = hostOf(l.url)
            return (
              <li key={l.id}>
                {editing ? (
                  <div className="ql-tile editing">
                    <Favicon host={host} title={l.title} />
                    <div className="ql-edit">
                      <input value={l.title} placeholder={host} maxLength={80} aria-label="Name" onChange={(e) => dash.updateLink(l.id, { title: e.target.value }, { debounce: 400 })} />
                      <input
                        value={l.url}
                        maxLength={2000}
                        aria-label="URL"
                        onChange={(e) => e.target.value.trim() && dash.updateLink(l.id, { url: e.target.value }, { debounce: 400 })}
                      />
                    </div>
                    <button className="icon-btn sm" onClick={() => dash.deleteLink(l.id)} aria-label={`Remove ${l.title || host}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : (
                  <a className="ql-tile" href={normalizeUrl(l.url)} target="_blank" rel="noreferrer" title={l.url}>
                    <Favicon host={host} title={l.title} />
                    <span className="ql-text">
                      <span className="ql-title">{l.title || host}</span>
                      {l.title && <span className="ql-host">{host}</span>}
                    </span>
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
