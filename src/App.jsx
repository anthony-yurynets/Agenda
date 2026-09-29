import { useEffect, useState } from 'react'
import { isConfigured, supabase } from './lib/supabase'
import Login from './components/Login'
import Workspace from './components/Workspace'

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    if (!isConfigured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!isConfigured) return <SetupNotice />
  if (session === undefined) return <div className="boot"><div className="spinner" /></div>
  if (!session) return <Login />
  return <Workspace session={session} />
}

function SetupNotice() {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Vapor needs Supabase credentials</h1>
        <p className="muted">
          Copy <code>.env.example</code> to <code>.env</code>, fill in <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>, then restart the dev server.
        </p>
      </div>
    </div>
  )
}
