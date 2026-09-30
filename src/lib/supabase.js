import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
// Supabase's newer dashboards call this the "publishable" key; older ones "anon".
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

// Dev-only escape hatch used by preview.html to run the UI against an in-memory backend.
const fake = import.meta.env.DEV ? globalThis.__VAPOR_FAKE_SUPABASE__ : null

export const isConfigured = Boolean(fake || (url && anonKey))

/** Public connection details (the anon/publishable key is safe to share; RLS protects data). */
export const supabaseUrl = url
export const supabaseAnonKey = anonKey

export const supabase =
  fake ?? (url && anonKey ? createClient(url, anonKey, { auth: { persistSession: true, detectSessionInUrl: true } }) : null)
