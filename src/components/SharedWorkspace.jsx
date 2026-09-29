import { useEffect, useMemo, useState } from 'react'
import { callShareApi, sharedBackend } from '../lib/backends'
import Workspace from './Workspace'
import Logo from './Logo'

/** /s/<token>: edit someone's calendar without signing in. */
export default function SharedWorkspace({ token }) {
  const backend = useMemo(() => sharedBackend(token), [token])
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    callShareApi('/api/share', token, { op: 'session' }).then((res) =>
      setState(res.error ? { status: 'error', message: res.error.message } : { status: 'ready', info: res.data }),
    )
  }, [token])

  if (state.status === 'loading') return <div className="boot"><div className="spinner" /></div>
  if (state.status === 'error') {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-brand">
            <Logo size={30} />
            <span>Vapor</span>
          </div>
          <h1>This link doesn’t work</h1>
          <p className="muted">{state.message} Ask the person who shared it for a new one.</p>
        </div>
      </div>
    )
  }
  return <Workspace backend={backend} guest={{ owner: state.info.owner }} />
}
