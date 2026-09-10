// Why: release notes are consumed independently by local preparation and publish preflight, so
// their versioned path and content contract must stay identical at both call sites.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export function releaseNotesRelativePath(version) {
  return `docs/releases/${version}.md`
}

export function assertReleaseNotes(root, version) {
  const relativePath = releaseNotesRelativePath(version)
  let notes
  try {
    notes = readFileSync(join(root, relativePath), 'utf8').trim()
  } catch {
    throw new Error(`Reviewed release notes are required at ${relativePath}`)
  }
  const lines = notes.split('\n')
  if (lines[0] !== `# AgentStart ${version}`) {
    throw new Error(`Release notes must start with: # AgentStart ${version}`)
  }
  const body = lines
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('<!--'))
  if (body.length === 0) {
    throw new Error(`Release notes at ${relativePath} need user-facing body text`)
  }
}
