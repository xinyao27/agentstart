import type { SkillUpdateStartResult } from '@agentstart/protocol'
import { translate } from '~renderer/i18n/i18n'

type SkillRunRejectionReason = Extract<SkillUpdateStartResult, { started: false }>['reason']

/** Why a manage run never started. `undefined` covers a dropped IPC call. */
export function describeSkillRunRejection(reason: SkillRunRejectionReason | undefined): string {
  if (!reason) {
    return translate(
      'auto.components.skills.startRejection.unavailable',
      'Could not reach the skills command.'
    )
  }
  switch (reason) {
    case 'already-running':
      return translate(
        'auto.components.skills.startRejection.alreadyRunning',
        'Another skills command is still running.'
      )
    case 'invalid-names':
      return translate(
        'auto.components.skills.startRejection.invalidNames',
        'That skill name is not a valid package name.'
      )
    case 'invalid-source':
      return translate(
        'auto.components.skills.startRejection.invalidSource',
        'Enter a source like owner/repo, a GitHub URL, or a publisher domain.'
      )
    case 'invalid-scope':
      return translate(
        'auto.components.skills.startRejection.invalidScope',
        'That project is no longer available.'
      )
  }
}
