// Standalone widget (vapor-widget.html) for embedding in Notion. It's one
// self-contained file that talks to Supabase directly with a widget token.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/theme'
import WidgetApp from './components/WidgetApp'

// Sandboxed frames can lack randomUUID; getRandomValues is always there.
if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = () =>
    '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
      (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16),
    )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WidgetApp config={window.__VAPOR_WIDGET__} />
  </StrictMode>,
)
