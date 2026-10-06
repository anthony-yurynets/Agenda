// The Notion widget page (/widget.html#t=<token>). Notion frames it, either via
// the downloaded agenda-widget.html wrapper or an /embed block. It reaches your
// calendar through the widget database functions using the token in the URL.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/theme'
import WidgetApp from './components/WidgetApp'
import { supabaseAnonKey, supabaseUrl } from './lib/supabase'

// Sandboxed frames can lack randomUUID; getRandomValues is always there.
if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = () =>
    '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
      (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16),
    )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WidgetApp config={{ url: supabaseUrl, key: supabaseAnonKey, token: new URLSearchParams(location.hash.slice(1)).get('t') }} />
  </StrictMode>,
)
