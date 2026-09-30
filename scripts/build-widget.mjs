// Builds the Notion widget into ONE self-contained HTML file (all JS and CSS
// inlined), written to public/widget-template.html. The app's Integrations
// page fills in the Supabase URL/key + a widget token and downloads it as
// vapor-widget.html.
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const outDir = path.join(root, 'node_modules/.vapor-widget')

await build({
  root,
  configFile: false,
  logLevel: 'warn',
  base: './',
  plugins: [react()],
  // The widget gets its Supabase settings from the downloaded file, not from .env.
  envPrefix: 'VAPOR_WIDGET_NONE_',
  build: {
    outDir,
    emptyOutDir: true,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
    chunkSizeWarningLimit: 2000,
    rolldownOptions: { input: path.join(root, 'widget.html'), output: { codeSplitting: false } },
  },
})

let html = fs.readFileSync(path.join(outDir, 'widget.html'), 'utf8')
const read = (ref) => fs.readFileSync(path.join(outDir, ref.replace(/^\.?\//, '')), 'utf8')

html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, (_, src) => {
  // A literal "</script" inside the code would end the inline tag early.
  const js = read(src).replace(/<\/script/gi, '<\\/script')
  return `<script type="module">${js}</script>`
})
html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/g, (_, href) => `<style>${read(href)}</style>`)

const leftovers = html.match(/(src|href)="\.?\/?assets\/[^"]+"/g)
if (leftovers) throw new Error(`Widget build still references external files: ${leftovers.join(', ')}`)
if (!html.includes('null /*VAPOR_WIDGET_CONFIG*/')) throw new Error('Config placeholder missing from widget build')

const dest = path.join(root, 'public/widget-template.html')
fs.writeFileSync(dest, html)
console.log(`widget: ${path.relative(root, dest)} (${Math.round(html.length / 1024)} kB, self-contained)`)
