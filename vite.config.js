import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Serves /api/* serverless functions during `npm run dev`, mirroring Vercel.
function vercelApiInDev() {
  return {
    name: 'vercel-api-in-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = /^\/api\/([\w-]+)\/?(?:\?.*)?$/.exec(req.url ?? '')
        if (!match) return next()
        try {
          const mod = await server.ssrLoadModule(`/api/${match[1]}.js`)
          await mod.default(req, res)
        } catch (err) {
          server.config.logger.error(err.stack ?? String(err))
          if (!res.headersSent) res.statusCode = 500
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Expose non-VITE_ vars (e.g. SUPABASE_SERVICE_ROLE_KEY) to the dev API only.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return {
    plugins: [react(), vercelApiInDev()],
    // React + supabase-js is ~150 kB gzipped; that's expected, not a problem.
    build: {
      chunkSizeWarningLimit: 700,
      // Second page: the Notion widget (framed by Notion, see Integrations → Notion widget).
      rolldownOptions: { input: { main: 'index.html', widget: 'widget.html' } },
    },
  }
})
