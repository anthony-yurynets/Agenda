import { useState } from 'react'
import { Check, Eye, EyeOff, Monitor, Moon, Pencil, Plug, Plus, Share2, Sun, Trash2, X } from 'lucide-react'
import { getThemePref, setThemePref } from '../lib/theme'
import { CATEGORY_PALETTE } from '../lib/domain'
import Logo from './Logo'

/** Sidebar: tools for the current page (categories on Calendar), then settings and theme. */
export default function Sidebar({ page, setPage, store, hiddenCats, toggleCategory, activeCategory, setActiveCategory, onClose, guest, embed }) {
  const { categories, createCategory, updateCategory, deleteCategory } = store
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState(null)

  const submitNew = (e) => {
    e.preventDefault()
    const name = newName.trim()
    if (name) createCategory(name.slice(0, 60))
    setNewName('')
    setAdding(false)
  }

  // Settings screens are owner-only.
  const settings =
    guest || embed
      ? []
      : [
          { id: 'sharing', label: 'Sharing', icon: Share2 },
          { id: 'integrations', label: 'Integrations', icon: Plug },
        ]

  return (
    <aside className="sidebar">
      <div className="brand">
        <Logo size={26} />
        <span>Vapor</span>
        <button className="icon-btn only-mobile" onClick={onClose} aria-label="Close menu">
          <X size={18} />
        </button>
      </div>

      {page === 'calendar' && (
      <div className="side-section first">
        <div className="side-heading">
          <span>Categories</span>
          <button className="icon-btn sm" onClick={() => setAdding(true)} aria-label="Add category">
            <Plus size={15} />
          </button>
        </div>
        <ul className="cat-list">
          {categories.map((c) => {
            const hidden = hiddenCats.has(c.id)
            if (editingId === c.id) {
              return (
                <CategoryEditor
                  key={c.id}
                  category={c}
                  onSave={(patch) => {
                    updateCategory(c.id, patch)
                    setEditingId(null)
                  }}
                  onDelete={() => {
                    deleteCategory(c.id)
                    setEditingId(null)
                  }}
                  onCancel={() => setEditingId(null)}
                />
              )
            }
            return (
              <li key={c.id} className={`cat-row ${hidden ? 'is-hidden' : ''} ${activeCategory === c.id ? 'is-default' : ''}`}>
                <button className="cat-main" onClick={() => setActiveCategory(c.id)} title="Default for new blocks">
                  <span className="cat-dot" style={{ background: c.color }} />
                  <span className="cat-name">{c.name}</span>
                  {activeCategory === c.id && <Check size={14} className="cat-default" />}
                </button>
                <button className="icon-btn sm ghost-hover" onClick={() => setEditingId(c.id)} aria-label={`Edit ${c.name}`}>
                  <Pencil size={13} />
                </button>
                <button
                  className="icon-btn sm ghost-hover keep"
                  onClick={() => toggleCategory(c.id)}
                  aria-label={hidden ? `Show ${c.name}` : `Hide ${c.name}`}
                >
                  {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </li>
            )
          })}
          {adding && (
            <li>
              <form className="cat-new" onSubmit={submitNew}>
                <input
                  autoFocus
                  placeholder="Category name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onBlur={submitNew}
                  onKeyDown={(e) => e.key === 'Escape' && (setNewName(''), setAdding(false))}
                />
              </form>
            </li>
          )}
        </ul>
      </div>

      )}

      <div className="side-spacer" />

      {settings.length > 0 && (
        <nav className="nav settings-nav" aria-label="Settings">
          <div className="side-heading">
            <span>Settings</span>
          </div>
          {settings.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => setPage(id)}>
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}

      <ThemeSwitch />
    </aside>
  )
}

function ThemeSwitch() {
  const [pref, setPref] = useState(getThemePref)
  const options = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Monitor },
  ]
  return (
    <div className="theme-switch" role="radiogroup" aria-label="Theme">
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

function CategoryEditor({ category, onSave, onDelete, onCancel }) {
  const [name, setName] = useState(category.name)
  const [color, setColor] = useState(category.color)
  const save = (e) => {
    e?.preventDefault()
    onSave({ name: name.trim().slice(0, 60) || category.name, color })
  }
  return (
    <li className="cat-editor">
      <form onSubmit={save}>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onCancel()} />
        <div className="swatches">
          {CATEGORY_PALETTE.map((c) => (
            <button
              type="button"
              key={c}
              className={`swatch ${c === color ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
        <div className="cat-editor-actions">
          <button type="button" className="btn ghost danger sm" onClick={onDelete}>
            <Trash2 size={14} /> Delete
          </button>
          <span className="flex1" />
          <button type="button" className="btn ghost sm" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary sm">Save</button>
        </div>
      </form>
    </li>
  )
}
