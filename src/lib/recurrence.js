import { occurrenceDates, occurrenceId } from './domain'

/**
 * Expand series templates into virtual occurrences for [from, to].
 *
 * Returns
 *  - display: every concrete block plus virtual occurrences (with their
 *    sub-block trees), keyed by id. Virtual ids are `<templateId>::<date>`.
 *  - aliases: occurrence id -> id of the real row that replaced it (an
 *    occurrence that was edited individually), so selections survive.
 */
export function expandBlocks(blocks, from, to) {
  const all = Object.values(blocks)
  const kids = new Map()
  const aliases = {}
  for (const b of all) {
    if (b.parent_id) {
      if (!kids.has(b.parent_id)) kids.set(b.parent_id, [])
      kids.get(b.parent_id).push(b)
    }
    if (b.recurrence_id && b.recurrence_date) aliases[occurrenceId(b.recurrence_id, b.recurrence_date)] = b.id
  }

  const display = { ...blocks }
  const addVirtual = (src, date, parentId, seriesId) => {
    const id = occurrenceId(src.id, date)
    display[id] = {
      ...src,
      id,
      date,
      parent_id: parentId,
      repeat: null,
      productivity_rating: null, // rated per occurrence, once it's a real row
      virtual: true,
      seriesId,
      templateId: src.id,
      occurrenceDate: date,
    }
    for (const c of kids.get(src.id) ?? []) addVirtual(c, date, id, seriesId)
  }

  for (const t of all) {
    if (!t.repeat || t.parent_id) continue
    for (const date of occurrenceDates(t.date, t.repeat, from, to, t.repeat_exdates)) {
      if (aliases[occurrenceId(t.id, date)]) continue // edited individually
      addVirtual(t, date, null, t.id)
    }
  }
  return { display, aliases }
}

/** True for a series template row or anything nested inside one. */
export function isInTemplate(blocks, block) {
  let cur = block
  while (cur) {
    if (cur.repeat && !cur.virtual) return true
    cur = cur.parent_id ? blocks[cur.parent_id] : null
  }
  return false
}

/** The series a displayed block belongs to (template id), if any. */
export function seriesOf(blocks, block) {
  if (!block) return null
  if (block.virtual) return block.seriesId
  let cur = block
  while (cur) {
    if (cur.repeat) return cur.id
    if (!cur.parent_id && cur.recurrence_id) return cur.recurrence_id
    cur = cur.parent_id ? blocks[cur.parent_id] : null
  }
  return null
}
