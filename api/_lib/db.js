import { createClient } from '@supabase/supabase-js'

let admin

/** Service-role Supabase client (bypasses RLS — always scope queries to a user). */
export function db() {
  // Test hook: node tests inject an in-memory client.
  if (globalThis.__VAPOR_TEST_DB__) return globalThis.__VAPOR_TEST_DB__
  if (!admin) {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Server is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  return admin
}

/** Look up an active share link by its token. `kind` may be one kind or a list. */
export async function findShareLink(token, kind) {
  if (typeof token !== 'string' || token.length < 24) return null
  const kinds = Array.isArray(kind) ? kind : [kind]
  const { data, error } = await db().from('share_links').select('*').eq('token', token).in('kind', kinds).maybeSingle()
  if (error || !data) return null
  if (data.revoked_at) return null
  if (data.expires_at && new Date(data.expires_at) <= new Date()) return null
  return data
}

/** Owner's first name for "Editing Anthony's calendar". */
export async function ownerName(userId) {
  try {
    const { data } = await db().auth.admin.getUserById(userId)
    const meta = data?.user?.user_metadata ?? {}
    const full = meta.full_name || meta.name || ''
    return full.split(' ')[0] || null
  } catch {
    return null
  }
}
