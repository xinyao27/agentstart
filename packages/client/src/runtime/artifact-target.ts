import { ARTIFACT_PROTOCOL_CAPABILITY, ArtifactClient } from '@yiru/protocol'
import { translate } from '~renderer/i18n/i18n'

import {
  openConfiguredBrowserHostProtocol,
  readConfiguredBrowserHostStatus
} from './browser-host-runtime'

export async function openArtifactTarget(): Promise<ArtifactClient | null> {
  const status = await readConfiguredBrowserHostStatus()
  if (!status.capabilities?.includes(ARTIFACT_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new ArtifactClient(await openConfiguredBrowserHostProtocol())
}

// Why: the artifact namespace is protobuf-only, so a missing capability means
// the connected daemon predates the cutover — an error, not a legacy retry.
export async function requireArtifactClient(): Promise<ArtifactClient> {
  const client = await openArtifactTarget()
  if (!client) {
    throw new Error(
      translate(
        'runtime.artifactTarget.unavailable',
        'Artifacts need a current Yiru daemon connection.'
      )
    )
  }
  return client
}
