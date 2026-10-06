import { useEffect, useState } from 'react'
import { isConfigured, supabase } from './lib/supabase'
import Login from './components/Login'
import Workspace from './components/Workspace'
import SharedWorkspace from './components/SharedWorkspace'
import BookingPage from './components/BookingPage'
import SharedGroupPage from './components/competitions/SharedGroupPage'

// Guest routes work without signing in.
const SHARE_ROUTE = /^\/s\/([\w-]{24,})\/?$/
const BOOKING_ROUTE = /^\/b\/([\w-]{24,})\/?$/
const GROUP_ROUTE = /^\/g\/([\w-]{24,})\/?$/

export default function App() {
  const path = window.location.pathname
  const booking = BOOKING_ROUTE.exec(path)
  if (booking) return <BookingPage token={booking[1]} />
  const group = GROUP_ROUTE.exec(path)
  if (group) return <SharedGroupPage token={group[1]} />
  const share = SHARE_ROUTE.exec(path)
  if (share) return <SharedWorkspace token={share[1]} />
  return <OwnerApp />
}

function OwnerApp() {
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
        <h1>Agenda needs Supabase credentials</h1>
        <p className="muted">
          Copy <code>.env.example</code> to <code>.env</code>, fill in <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>, then restart the dev server.
        </p>
      </div>
    </div>
  )
}
