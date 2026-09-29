// Booking API: a visitor with a booking link picks a free slot inside the
// owner's bookable blocks. The booking becomes a sub-block of that block.
// Only free slots are ever returned — never the titles of the owner's blocks.

import { db, findShareLink, ownerName } from './_lib/db.js'
import { bearer, httpError, jsonEndpoint } from './_lib/http.js'
import { expandedRows, materialize, unwrap } from './_lib/tools.js'
import {
  addDaysISO,
  freeSlots,
  fromMinutes,
  isOccurrenceId,
  isValidDate,
  nowIn,
  toMinutes,
} from '../src/lib/domain.js'

const MAX_DAYS_AHEAD = 90
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const remaining = (link) => (link.max_uses ? Math.max(link.max_uses - link.uses, 0) : null)

/** Free slots per day in [from, to] for this link. */
async function availability(sb, link, from, to) {
  const rows = await expandedRows(sb, link.user_id, from, to)
  const active = rows.filter((r) => r.status !== 'canceled')
  const top = active.filter((r) => !r.parent_id)
  const now = nowIn(link.timezone)
  const days = new Map()

  for (const w of top.filter((r) => r.bookable)) {
    const start = toMinutes(w.start_time)
    const end = toMinutes(w.end_time)
    const busy = [
      // Existing sub-blocks (earlier bookings, or anything the owner put there).
      ...active.filter((r) => r.parent_id === w.id),
      // Other blocks the owner has at the same time.
      ...top.filter((r) => r.id !== w.id && !r.bookable && r.date === w.date),
    ].map((r) => [toMinutes(r.start_time), toMinutes(r.end_time)])

    for (const s of freeSlots({ date: w.date, start, end, busy }, link.slot_minutes, now)) {
      if (!days.has(w.date)) days.set(w.date, [])
      days.get(w.date).push({ window_id: w.id, start: fromMinutes(s.start), end: fromMinutes(s.end) })
    }
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, slots]) => ({
      date,
      slots: slots
        .sort((a, b) => a.start.localeCompare(b.start))
        // Two overlapping bookable blocks could offer the same time twice.
        .filter((s, i, arr) => i === 0 || s.start !== arr[i - 1].start),
    }))
}

export default jsonEndpoint(async (req, body) => {
  const link = await findShareLink(bearer(req), 'booking')
  if (!link) throw httpError(404, 'This booking link is no longer available.')
  const sb = db()
  const info = {
    name: link.name,
    owner: await ownerName(link.user_id),
    slot_minutes: link.slot_minutes,
    timezone: link.timezone,
    remaining: remaining(link),
  }
  const closed = info.remaining === 0

  switch (body.op) {
    case 'load': {
      if (closed) return { ...info, closed: true, days: [] }
      const today = nowIn(link.timezone).date
      const from = isValidDate(body.from) && body.from > today ? body.from : today
      const last = addDaysISO(today, MAX_DAYS_AHEAD)
      let to = isValidDate(body.to) ? body.to : addDaysISO(from, 13)
      if (to > last) to = last
      if (to > addDaysISO(from, 31)) to = addDaysISO(from, 31)
      return { ...info, from, to, last, days: from <= to ? await availability(sb, link, from, to) : [] }
    }

    case 'book': {
      if (closed) throw httpError(410, 'This booking link has been fully used.')
      const name = String(body.name ?? '').trim().slice(0, 80)
      const email = String(body.email ?? '').trim().slice(0, 120)
      const note = String(body.note ?? '').trim().slice(0, 500)
      if (!name) throw httpError(400, 'Please enter your name.')
      if (email && !EMAIL_RE.test(email)) throw httpError(400, 'That email doesn’t look right.')
      if (!isValidDate(body.date) || !body.window_id || !body.start) throw httpError(400, 'Pick a time first.')

      // Re-check against live data: the slot must still be free right now.
      const day = (await availability(sb, link, body.date, body.date))[0]
      const slot = day?.slots.find((s) => s.window_id === body.window_id && s.start === body.start)
      if (!slot) throw httpError(409, 'Sorry, that time was just taken. Please pick another.')

      if (!unwrap(await sb.rpc('claim_share_use', { p_link: link.id }))) {
        throw httpError(410, 'This booking link has been fully used.')
      }

      let bookingId = null
      try {
        const parent = isOccurrenceId(slot.window_id)
          ? await materialize(sb, link.user_id, slot.window_id)
          : unwrap(await sb.from('blocks').select('*').eq('user_id', link.user_id).eq('id', slot.window_id).single())

        const booking = unwrap(
          await sb
            .from('blocks')
            .insert({
              user_id: link.user_id,
              parent_id: parent.id,
              title: link.name ? `${link.name} · ${name}` : name,
              date: body.date,
              start_time: slot.start,
              end_time: slot.end,
              category_id: parent.category_id,
              status: 'planned',
              source: 'booking',
              notes: [email && `Email: ${email}`, note].filter(Boolean).join('\n'),
            })
            .select('*')
            .single(),
        )
        bookingId = booking.id

        // Two visitors racing for the same slot: the earlier insert wins.
        const clash = unwrap(await sb.from('blocks').select('id, start_time, end_time, status, created_at').eq('parent_id', parent.id))
          .filter((r) => r.id !== booking.id && r.status !== 'canceled')
          .filter((r) => toMinutes(r.start_time) < toMinutes(slot.end) && toMinutes(r.end_time) > toMinutes(slot.start))
          .some((r) => r.created_at < booking.created_at || (r.created_at === booking.created_at && r.id < booking.id))
        if (clash) throw httpError(409, 'Sorry, that time was just taken. Please pick another.')
      } catch (err) {
        if (bookingId) await sb.from('blocks').delete().eq('id', bookingId)
        await sb.rpc('release_share_use', { p_link: link.id })
        throw err
      }

      return { date: body.date, start: slot.start, end: slot.end, timezone: link.timezone, owner: info.owner }
    }

    default:
      throw httpError(400, `Unknown op "${body.op}"`)
  }
})
