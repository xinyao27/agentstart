import { EXTERNAL_EDITOR_PROTOCOL_CAPABILITY } from '@yiru/protocol'
import { useEffect, useState } from 'react'
import { runtimeEnvironmentSupportsCapability } from '~renderer/runtime/rpc-client'

import type { RuntimeRemoteSshSupport } from './worktree-path-opening'

type SshSupportProbeResult = {
  runtimeEnvironmentId: string
  connectionId: string
  supported: boolean
}

export function useRuntimeRemoteSshSupport(
  runtimeEnvironmentId?: string | null,
  connectionId?: string | null
): RuntimeRemoteSshSupport {
  const trimmedEnvironmentId = runtimeEnvironmentId?.trim() ?? ''
  const trimmedConnectionId = connectionId?.trim() ?? ''
  const needsProbe = trimmedEnvironmentId !== '' && trimmedConnectionId !== ''

  const [probeResult, setProbeResult] = useState<SshSupportProbeResult | null>(null)

  useEffect(() => {
    if (!needsProbe) {
      return
    }
    let active = true
    void runtimeEnvironmentSupportsCapability(
      trimmedEnvironmentId,
      EXTERNAL_EDITOR_PROTOCOL_CAPABILITY
    )
      .then((supported) => {
        if (active) {
          setProbeResult({
            runtimeEnvironmentId: trimmedEnvironmentId,
            connectionId: trimmedConnectionId,
            supported
          })
        }
      })
      .catch(() => {
        if (active) {
          setProbeResult({
            runtimeEnvironmentId: trimmedEnvironmentId,
            connectionId: trimmedConnectionId,
            supported: false
          })
        }
      })
    return () => {
      active = false
    }
  }, [needsProbe, trimmedConnectionId, trimmedEnvironmentId])

  if (!needsProbe) {
    return 'not-needed'
  }
  // Why: a stale result from a previous (runtimeEnvironmentId, connectionId)
  // pair must never render as this host's answer — tag every stored result
  // with the identity that produced it and only trust an exact match.
  if (
    probeResult &&
    probeResult.runtimeEnvironmentId === trimmedEnvironmentId &&
    probeResult.connectionId === trimmedConnectionId
  ) {
    return probeResult.supported ? 'supported' : 'unsupported'
  }
  return 'checking'
}
