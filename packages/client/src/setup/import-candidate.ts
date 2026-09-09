import type { RepoSetupImportCandidateValue } from '@yiru/protocol'
import {
  SETUP_SCRIPT_IMPORT_PROVIDERS,
  type SetupScriptImportProvider
} from '@yiru/protocol/setup/import-providers'
import { translate } from '~renderer/i18n/i18n'

export type SetupScriptImportCandidate = Omit<RepoSetupImportCandidateValue, 'provider'> & {
  provider: SetupScriptImportProvider
}

export function setupImportCandidate(
  candidate: RepoSetupImportCandidateValue
): SetupScriptImportCandidate {
  const provider = SETUP_SCRIPT_IMPORT_PROVIDERS.find((value) => value === candidate.provider)
  if (!provider) {
    throw new TypeError(
      translate(
        'setup.import.unknownProvider',
        'The setup import source is not supported: {{provider}}',
        { provider: candidate.provider }
      )
    )
  }
  return { ...candidate, provider }
}
