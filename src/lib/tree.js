/** Map of parent id (or 'root') -> children sorted by start. */
export function buildChildrenMap(blocks) {
  const map = new Map()
  for (const b of Object.values(blocks)) {
    const key = b.parent_id ?? 'root'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(b)
  }
  for (const list of map.values()) list.sort((a, b) => a.start - b.start || a.end - b.end)
  return map
}

export function descendantIds(blocks, id) {
  const out = []
  const stack = [id]
  const all = Object.values(blocks)
  while (stack.length) {
    const cur = stack.pop()
    for (const b of all) {
      if (b.parent_id === cur) {
        out.push(b.id)
        stack.push(b.id)
      }
    }
  }
  return out
}

export function ancestors(blocks, id) {
  const out = []
  let cur = blocks[id]
  while (cur?.parent_id && blocks[cur.parent_id]) {
    cur = blocks[cur.parent_id]
    out.unshift(cur)
  }
  return out
}

/** Side-by-side columns for overlapping blocks within a single day. */
export function layoutOverlaps(list) {
  const sorted = [...list].sort((a, b) => a.start - b.start || b.end - a.end)
  const result = new Map()
  let cluster = []
  let clusterEnd = -1
  const flush = () => {
    const colEnds = []
    const assigned = cluster.map((b) => {
      let col = colEnds.findIndex((end) => end <= b.start)
      if (col === -1) {
        col = colEnds.length
        colEnds.push(b.end)
      } else colEnds[col] = b.end
      return [b.id, col]
    })
    for (const [id, col] of assigned) result.set(id, { col, cols: colEnds.length })
  }
  for (const b of sorted) {
    if (b.start >= clusterEnd && cluster.length) {
      flush()
      cluster = []
    }
    cluster.push(b)
    clusterEnd = Math.max(clusterEnd, b.end)
  }
  if (cluster.length) flush()
  return result
}
