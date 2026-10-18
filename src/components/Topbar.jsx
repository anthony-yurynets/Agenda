import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut, Menu, Search, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function Topbar({ title, subtitle, session, guest, search, setSearch, showSearch, onMenu }) {
  const user = session?.user
  const name = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email
  const avatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const searchRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => !menuRef.current?.contains(e.target) && setOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !e.target.closest?.('input, textarea')) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header className="topbar">
      <button className="icon-btn only-mobile" onClick={onMenu} aria-label="Open menu">
        <Menu size={20} />
      </button>
      <div className="page-title">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <span className="flex1" />
      {showSearch && (
        <label className="search">
          <Search size={16} />
          <input
            ref={searchRef}
            placeholder="Search blocks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setSearch(''), e.currentTarget.blur())}
          />
          <kbd>/</kbd>
        </label>
      )}
      {guest ? (
        <div className="guest-pill" title="Anyone with this link can view and edit">
          <Users size={15} /> Shared link
        </div>
      ) : (
      <div className="user" ref={menuRef}>
        <button className="user-btn" onClick={() => setOpen((o) => !o)}>
          {avatar ? (
            <img src={avatar} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="avatar-fallback">{(name || '?').slice(0, 1).toUpperCase()}</span>
          )}
          <span className="user-meta">
            <strong>{name}</strong>
            <small>{user.email}</small>
          </span>
          <ChevronDown size={16} className="muted" />
        </button>
        {open && (
          <div className="menu">
            <button onClick={() => supabase.auth.signOut()}>
              <LogOut size={15} /> Sign out
            </button>
          </div>
        )}
      </div>
      )}
    </header>
  )
}
