import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Workspace from './Workspace'
import Logo from './Logo'
import { widgetBackend } from '../lib/backends'

function Notice({ title, children }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <Logo size={26} />
          <span>Vapor</span>
        </div>
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  )
}

export default function WidgetApp({ config }) {
  const backend = useMemo(() => {
    if (!config?.url || !config?.key || !config?.token) return null
    const client = createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false } })
    return widgetBackend(client, config.token)
  }, [config])
  const [state, setState] = useState(backend ? 'checking' : 'unconfigured')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!backend) return
    const today = new Date().toISOString().slice(0, 10)
    backend.loadBlocks(today, today).then((res) => {
      if (res.error) {
        setError(
          /widget_load/.test(res.error.message) && /function|schema cache/.test(res.error.message)
            ? 'Your database is missing the widget functions. Run supabase/migrations/0007_widget_rpc.sql in the Supabase SQL editor.'
            : res.error.message,
        )
        setState('error')
      } else setState('ready')
    })
  }, [backend])

  if (state === 'unconfigured') {
    return (
      <Notice title="Widget not connected">
        <p className="muted">
          This file doesn’t have a widget link inside it. In Vapor, open <strong>Integrations → Notion widget</strong> and use{' '}
          <strong>Download widget file</strong>, then add that file to Notion.
        </p>
      </Notice>
    )
  }
  if (state === 'checking') return <div className="boot"><div className="spinner" /></div>
  if (state === 'error') {
    return (
      <Notice title="Can’t load your calendar">
        <p className="muted">{error}</p>
        <p className="muted small">If you turned this widget link off, download a new widget file from Integrations.</p>
      </Notice>
    )
  }
  return <Workspace backend={backend} guest={{ owner: null }} embed />
}

