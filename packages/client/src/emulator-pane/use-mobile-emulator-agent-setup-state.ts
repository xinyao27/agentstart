import type { CliInstallStatus } from '@agentstart/protocol/cli-values'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AGENTSTART_CLI_SKILL_NAME } from '~renderer/agent/feature-install-commands'
import { translate } from '~renderer/i18n/i18n'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { readCliInstallStatus } from '~renderer/runtime/cli-install-client'
import {
  ensureAgentStartCliAvailableForAgentSkillTerminal,
  isAgentStartCliAvailableOnPath
} from '~renderer/skills/agent-cli-prerequisite'
import {
  GLOBAL_AGENT_SKILL_SOURCE_KINDS,
  useInstalledAgentSkill
} from '~renderer/skills/use-installed-agents'

import { getMobileEmulatorCliPathNeedsAttention } from './mobile-emulator-agent-setup-cli-state'

function getCliActionLabel(status: CliInstallStatus | null, busy: boolean): string {
  if (busy) {
    return translate(
      'auto.components.emulator.pane.use.mobile.emulator.agent.setup.state.fdcca1ec75',
      'Registering...'
    )
  }
  if (isAgentStartCliAvailableOnPath(status)) {
    return translate(
      'auto.components.emulator.pane.use.mobile.emulator.agent.setup.state.69fb2c2289',
      'Enabled'
    )
  }
  if (status?.state === 'installed') {
    return translate(
      'auto.components.emulator.pane.use.mobile.emulator.agent.setup.state.c6705092ba',
      'Fix PATH'
    )
  }
  return translate(
    'auto.components.emulator.pane.use.mobile.emulator.agent.setup.state.7c1b6bdb1e',
    'Enable'
  )
}

export function useMobileEmulatorAgentSetupState(enabled = true): {
  cliActionLabel: string
  cliBusy: boolean
  cliEnabled: boolean
  cliInstallStatus: CliInstallStatus | null
  cliPathNeedsAttention: boolean
  cliLoading: boolean
  cliSkillError: string | null
  cliSkillInstalled: boolean
  cliSkillLoading: boolean
  cliSupported: boolean
  completedCount: number
  handleEnableCli: () => Promise<void>
  recheckSetup: () => Promise<void>
  refreshCliSkill: () => Promise<boolean>
  setupComplete: boolean
  setupRechecking: boolean
  statusReady: boolean
  step2Blocked: boolean
} {
  const [cliInstallStatus, setCliInstallStatus] = useState<CliInstallStatus | null>(null)
  const [cliLoading, setCliLoading] = useState(true)
  const [cliBusy, setCliBusy] = useState(false)
  const [setupRechecking, setSetupRechecking] = useState(false)
  const mountedRef = useMountedRef()
  const {
    installed: cliSkillInstalled,
    loading: cliSkillLoading,
    error: cliSkillError,
    refresh: refreshCliSkill
  } = useInstalledAgentSkill(AGENTSTART_CLI_SKILL_NAME, {
    enabled,
    sourceKinds: GLOBAL_AGENT_SKILL_SOURCE_KINDS
  })

  const refreshCliStatus = useEventCallback(async (): Promise<void> => {
    setCliLoading(true)
    try {
      const status = await readCliInstallStatus()
      if (mountedRef.current) {
        setCliInstallStatus(status)
      }
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.emulator.pane.use.mobile.emulator.agent.setup.state.51074ccb05',
                'Failed to load CLI status.'
              )
        )
        setCliInstallStatus(null)
      }
    } finally {
      if (mountedRef.current) {
        setCliLoading(false)
      }
    }
  })

  useEffect(() => {
    if (!enabled) {
      return
    }
    void refreshCliStatus()
  }, [enabled, refreshCliStatus])

  useEffect(() => {
    if (!enabled) {
      return
    }
    // Why: users often register the CLI from Settings first; refresh on focus so
    // the emulator guide reflects the latest install/PATH state.
    const handleFocus = (): void => {
      void refreshCliStatus()
      void refreshCliSkill()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [enabled, refreshCliSkill, refreshCliStatus])

  const cliEnabled = isAgentStartCliAvailableOnPath(cliInstallStatus)
  const cliPathNeedsAttention = getMobileEmulatorCliPathNeedsAttention(cliInstallStatus)
  const cliSupported = cliInstallStatus?.supported ?? false
  const completedCount = [cliEnabled, cliSkillInstalled].filter(Boolean).length
  const step2Blocked = !cliEnabled && !cliSkillInstalled
  const setupComplete = cliEnabled && cliSkillInstalled
  const statusReady = !cliLoading && !cliSkillLoading

  const recheckSetup = async (): Promise<void> => {
    if (setupRechecking) {
      return
    }
    setSetupRechecking(true)
    try {
      const [cliStatus, skillInstalled] = await Promise.all([
        readCliInstallStatus(),
        refreshCliSkill()
      ])
      if (mountedRef.current) {
        setCliInstallStatus(cliStatus)
      }
      const cliReady = isAgentStartCliAvailableOnPath(cliStatus)
      if (!mountedRef.current) {
        return
      }
      if (cliReady && skillInstalled) {
        toast.success(
          translate(
            'auto.components.emulator.pane.use.mobile.emulator.agent.setup.state.35dea1ae12',
            'Agent control is ready.'
          )
        )
        return
      }
      if (skillInstalled) {
        toast.message(
          translate(
            'auto.components.emulator.pane.use.mobile.emulator.agent.setup.state.9dff3a6338',
            'Skill is installed. Enable the AgentStart CLI to finish setup.'
          )
        )
        return
      }
      if (cliReady) {
        toast.message(
          translate(
            'auto.components.emulator.pane.use.mobile.emulator.agent.setup.state.15986a1080',
            'AgentStart CLI is ready. Install the skill to finish setup.'
          )
        )
        return
      }
      toast.message(
        translate(
          'auto.components.emulator.pane.use.mobile.emulator.agent.setup.state.4c26913def',
          'Still not set up. Complete both steps to enable agent control.'
        )
      )
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.emulator.pane.use.mobile.emulator.agent.setup.state.c94ff11e91',
                'Could not re-check setup status.'
              )
        )
      }
    } finally {
      if (mountedRef.current) {
        setSetupRechecking(false)
      }
    }
  }

  const handleEnableCli = async (): Promise<void> => {
    setCliBusy(true)
    try {
      const next = await ensureAgentStartCliAvailableForAgentSkillTerminal({
        onStatusChange: setCliInstallStatus
      })
      if (mountedRef.current && isAgentStartCliAvailableOnPath(next)) {
        toast.success(
          translate(
            'auto.components.emulator.pane.use.mobile.emulator.agent.setup.state.2b519eed94',
            'Registered the AgentStart CLI in PATH.'
          )
        )
      }
    } finally {
      if (mountedRef.current) {
        setCliBusy(false)
      }
    }
  }

  return {
    cliActionLabel: getCliActionLabel(cliInstallStatus, cliBusy),
    cliBusy,
    cliEnabled,
    cliInstallStatus,
    cliPathNeedsAttention,
    cliLoading,
    cliSkillError,
    cliSkillInstalled,
    cliSkillLoading,
    cliSupported,
    completedCount,
    handleEnableCli,
    recheckSetup,
    refreshCliSkill,
    setupComplete,
    setupRechecking,
    statusReady,
    step2Blocked
  }
}
