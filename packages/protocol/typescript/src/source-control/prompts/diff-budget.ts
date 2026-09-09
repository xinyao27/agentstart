export const STAGED_DIFF_BYTE_BUDGET = 200_000

/** Splits a unified diff into one section per file, keyed on the `diff --git`
 *  header. Each section keeps the leading newline that preceded its header so
 *  concatenating the sections reproduces the original byte-for-byte. */
function splitDiffIntoFileSections(diff: string): string[] {
  const boundary = '\ndiff --git '
  const sections: string[] = []
  let start = 0
  let next = diff.indexOf(boundary)
  while (next !== -1) {
    // Include the boundary newline in the current section; the next section
    // starts at the `diff --git` header itself.
    sections.push(diff.slice(start, next + 1))
    start = next + 1
    next = diff.indexOf(boundary, start)
  }
  sections.push(diff.slice(start))
  return sections
}

/** Clips one section to `limit` bytes on a line boundary so the agent never sees
 *  a half-written diff line, and records how many bytes were dropped. */
function clipSectionOnLineBoundary(section: string, limit: number): string {
  if (section.length <= limit) {
    return section
  }
  if (limit <= 0) {
    return ''
  }

  const markerFor = (omitted: number): string => `\n...(diff truncated, ${omitted} bytes omitted)\n`
  let marker = markerFor(section.length)
  if (marker.length >= limit) {
    return marker.slice(0, limit)
  }

  // Reserve headroom for the marker, then back up to the previous newline unless
  // that would discard most of the budget (one very long line).
  const target = limit - marker.length
  const lineBreak = section.lastIndexOf('\n', target)
  const cut = lineBreak > target / 2 ? lineBreak : target
  const omitted = section.length - cut
  marker = markerFor(omitted)
  return `${section.slice(0, Math.min(cut, Math.max(0, limit - marker.length)))}${marker}`
}

/** Distributes `budget` across `sizes` by water-filling: everyone starts with an
 *  equal share, and the slack from files that fit is handed back to the files
 *  that don't. Keeps one huge generated file from starving the human-authored
 *  changes elsewhere in the diff. */
function allocateBudgetFairly(sizes: number[], budget: number): number[] {
  const alloc: number[] = Array.from({ length: sizes.length }, () => 0)
  let active = sizes.map((_, i) => i)
  let remaining = budget
  while (active.length > 0 && remaining > 0) {
    const share = Math.floor(remaining / active.length)
    if (share === 0) {
      break
    }
    const stillActive: number[] = []
    for (const i of active) {
      const need = sizes[i] - alloc[i]
      const grant = Math.min(need, share)
      alloc[i] += grant
      remaining -= grant
      if (grant < need) {
        stillActive.push(i)
      }
    }
    active = stillActive
  }
  return alloc
}

/** Truncates a diff that exceeds the byte budget. Splits the budget fairly across
 *  files and clips on line boundaries, so a single oversized file can't crowd out
 *  the rest and the agent never receives a malformed diff. */
export function truncateDiffForPrompt(
  diff: string,
  budget: number = STAGED_DIFF_BYTE_BUDGET
): string {
  if (diff.length <= budget) {
    return diff
  }
  const sections = splitDiffIntoFileSections(diff)
  if (sections.length <= 1) {
    return clipSectionOnLineBoundary(diff, budget)
  }
  const allocations = allocateBudgetFairly(
    sections.map((section) => section.length),
    budget
  )
  return sections.map((section, i) => clipSectionOnLineBoundary(section, allocations[i])).join('')
}
