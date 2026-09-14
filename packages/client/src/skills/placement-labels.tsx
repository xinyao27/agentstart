import type { SkillInstallationTopology, SkillPlacement } from '@agentstart/protocol'
import { translate } from '~renderer/i18n/i18n'
import {
  ArrowSquareOut,
  Copy,
  GitBranch,
  LinkBreak,
  LinkSimple,
  Lock,
  PuzzlePiece,
  Question,
  Star
} from '~renderer/icons/hugeicons'

type TopologyIcon = React.ComponentType<{ className?: string; weight?: 'regular' }>

/** Form is carried by shape, never by color — color stays free for status. */
export const placementTopologyIcons: Record<SkillInstallationTopology, TopologyIcon> = {
  'canonical-copy': Star,
  'provider-alias': LinkSimple,
  'independent-copy': Copy,
  'external-link': ArrowSquareOut,
  'broken-link': LinkBreak,
  'read-only': Lock,
  'repo-scope': GitBranch,
  'plugin-cache': PuzzlePiece,
  unknown: Question
}

export function placementTopologyLabel(topology: SkillInstallationTopology): string {
  switch (topology) {
    case 'canonical-copy':
      return translate('auto.components.skills.topology.canonicalCopy', 'Canonical')
    case 'provider-alias':
      return translate('auto.components.skills.topology.providerAlias', 'Linked')
    case 'independent-copy':
      return translate('auto.components.skills.topology.independentCopy', 'Copy')
    case 'external-link':
      return translate('auto.components.skills.topology.externalLink', 'External link')
    case 'broken-link':
      return translate('auto.components.skills.topology.brokenLink', 'Broken link')
    case 'read-only':
      return translate('auto.components.skills.topology.readOnly', 'Read only')
    case 'repo-scope':
      return translate('auto.components.skills.topology.repoScope', 'In repository')
    case 'plugin-cache':
      return translate('auto.components.skills.topology.pluginCache', 'From plugin')
    case 'unknown':
      return translate('auto.components.skills.topology.unknown', 'Unclassified')
  }
}

/** What this form means for editing and updating — the tooltip body. */
export function placementTopologyDescription(topology: SkillInstallationTopology): string {
  switch (topology) {
    case 'canonical-copy':
      return translate(
        'auto.components.skills.topology.canonicalCopyHint',
        'The shared agent skills home. Updates land here first.'
      )
    case 'provider-alias':
      return translate(
        'auto.components.skills.topology.providerAliasHint',
        'A link into the shared home, so this agent always sees the same files.'
      )
    case 'independent-copy':
      return translate(
        'auto.components.skills.topology.independentCopyHint',
        'Its own copy of the files. Editing it changes nothing anywhere else.'
      )
    case 'external-link':
      return translate(
        'auto.components.skills.topology.externalLinkHint',
        'A link to files outside the skill homes, owned by wherever it points.'
      )
    case 'broken-link':
      return translate(
        'auto.components.skills.topology.brokenLinkHint',
        'The link has no target left. This agent cannot load the skill.'
      )
    case 'read-only':
      return translate(
        'auto.components.skills.topology.readOnlyHint',
        'These files cannot be written here, so updates will not reach it.'
      )
    case 'repo-scope':
      return translate(
        'auto.components.skills.topology.repoScopeHint',
        'Committed to a repository, so the checkout owns it rather than this machine.'
      )
    case 'plugin-cache':
      return translate(
        'auto.components.skills.topology.pluginCacheHint',
        'Shipped inside an installed plugin, which owns updates to it.'
      )
    case 'unknown':
      return translate(
        'auto.components.skills.topology.unknownHint',
        'The host that scanned this directory did not report how it is held.'
      )
  }
}

/**
 * The root's name without the noise a full listing repeats.
 *
 * Root labels come from the scanner as plain data ("Claude home"), and the
 * trailing scope word is already implied by the column it sits in.
 */
export function shortRootLabel(placement: SkillPlacement): string {
  return placement.rootLabel.replace(/\s+home$/i, '')
}

/** Segments kept whole when a path has to give up room. */
const PINNED_PATH_SEGMENTS = 2

/**
 * A directory split so an over-long row elides its middle rather than its tail.
 *
 * The tail is what sets one install apart from the next — the version and the
 * folder that holds the skill — while the head only repeats the root the row
 * already names, so the head is the end worth cutting. The tail carries its own
 * separator so the two parts rejoin as one readable path.
 */
export function splitPathForDisplay(path: string): { head: string; tail: string } {
  let cut = path.length
  let separators = 0
  while (separators < PINNED_PATH_SEGMENTS) {
    const separator = Math.max(path.lastIndexOf('/', cut - 1), path.lastIndexOf('\\', cut - 1))
    if (separator < 0) {
      break
    }
    cut = separator
    separators += 1
  }
  return separators === 0
    ? { head: '', tail: path }
    : { head: path.slice(0, cut), tail: path.slice(cut) }
}
