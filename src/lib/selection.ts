type SelectableTrack = { uri: string }

/**
 * Applies a single-track or inclusive range selection while preserving the current ranking order.
 * Selecting an unselected target adds the whole range; selecting an already selected target removes it.
 */
export function updateTrackSelection(rows: readonly SelectableTrack[], selected: ReadonlySet<string>, index: number, anchor: number | null, selectRange: boolean) {
  const next = new Set(selected)
  const target = rows[index]
  if (!target) return next

  const shouldSelect = !next.has(target.uri)
  const start = selectRange && anchor !== null ? Math.min(anchor, index) : index
  const end = selectRange && anchor !== null ? Math.max(anchor, index) : index
  for (let current = start; current <= end; current++) shouldSelect ? next.add(rows[current].uri) : next.delete(rows[current].uri)
  return next
}
