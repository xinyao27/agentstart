import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '@agentstart/protocol/agent/launch-defaults'
import {
  applyAgentPermissionMode,
  resolveAgentPermissionModeSummary,
  type AgentPermissionMode
} from '@agentstart/protocol/agent/launch/permissions'
import {
  getTuiAgentDefaultArgs,
  getTuiAgentDefaultEnv
} from '@agentstart/protocol/agent/launch/settings'
import { isTuiAgentEnabled, normalizeDisabledTuiAgents } from '@agentstart/protocol/agent/selection'
import type { TuiAgent } from '@agentstart/protocol/agent/types'
import { getAgentCatalog, AgentIcon } from '~renderer/agent/catalog'
import { useDetectedAgents } from '~renderer/agent/use-detected'
import { translate } from '~renderer/i18n/i18n'
import { Check, Terminal, ArrowClockwise as RefreshCw } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useAppStore } from '~renderer/store/state'
import { cn } from '~renderer/ui/class-names'

import { Button } from '../ui/button'
import { enqueueAgentAvailabilityUpdate } from './agent-availability'
import { AgentPermissionsSetting } from './agent-permissions-setting'
import { AgentRow } from './agent-row'
import { AgentGeneratedTabTitlesSetting, AgentStatusHooksSetting } from './agent-status-settings'
import { AgentAwakeSetting } from './agent/awake-setting'
import { AgentCacheTimerSection } from './agent/cache-timer-section'
import { AgentRuntimeSetting } from './agent/runtime-setting'
import type { AgentsPaneProps } from './agents-pane-types'
import { buildCodexSessionSourceHomeControl } from './codex-session-source-home-control'
import { SettingsBadge, SettingsSubsectionHeader } from './form-controls'
import { getSettingOwnershipSummary } from './setting-ownership'

type DefaultAgentPillProps = {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function DefaultAgentPill({ active, onClick, children }: DefaultAgentPillProps): React.JSX.Element {
  return (
    <Button
      variant="quiet"
      size="sm"
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'text-sm gap-2 py-1.5 ',
        active
          ? 'border-muted-foreground/40 bg-accent text-accent-foreground'
          : 'bg-background/50 hover:border-muted-foreground/35 '
      )}
    >
      {children}
    </Button>
  )
}

export function AgentsPane({
  settings,
  updateSettings,
  wslSupportedPlatform,
  wslAvailable,
  wslDistros,
  wslCapabilitiesLoading
}: AgentsPaneProps): React.JSX.Element {
  const { detectedIds: detectedList, isRefreshing, refresh } = useDetectedAgents()
  // Why: refresh re-spawns the user's login shell to re-capture PATH
  // (preflight:refreshAgents on the main side). This handles the
  // "installed a new CLI, AgentStart doesn't see it yet" case without a restart.
  const handleRefresh = (): void => {
    void refresh()
  }
  const detectedIds = (() => (detectedList ? new Set(detectedList) : null))()

  const defaultAgent = settings.defaultTuiAgent
  const agentOwnership = getSettingOwnershipSummary('agentLaunchDefaults')
  const cmdOverrides = settings.agentCmdOverrides ?? {}
  const agentDefaultArgs = settings.agentDefaultArgs ?? {}
  const agentDefaultEnv = settings.agentDefaultEnv ?? {}
  const agentPermissionMode = resolveAgentPermissionModeSummary({
    agentDefaultArgs,
    agentDefaultEnv
  })
  const disabledAgents = normalizeDisabledTuiAgents(settings.disabledTuiAgents)

  const setDefault = (id: TuiAgent | 'blank' | null): void => {
    updateSettings({ defaultTuiAgent: id })
  }

  const setAgentEnabled = (id: TuiAgent, enabled: boolean): void => {
    void enqueueAgentAvailabilityUpdate({
      getSettings: () => useAppStore.getState().settings,
      fallbackSettings: settings,
      updateSettings,
      agentId: id,
      enabled
    })
  }

  const saveOverride = (id: TuiAgent, value: string): void => {
    const next = { ...cmdOverrides }
    if (value) {
      next[id] = value
    } else {
      delete next[id]
    }
    updateSettings({ agentCmdOverrides: next })
  }

  const saveAgentArgs = (id: TuiAgent, value: string): void => {
    updateSettings({
      agentDefaultArgs: {
        ...agentDefaultArgs,
        [id]: value
      }
    })
  }

  const saveAgentEnv = (id: TuiAgent, value: Record<string, string>): void => {
    updateSettings({
      agentDefaultEnv: {
        ...agentDefaultEnv,
        [id]: value
      }
    })
  }

  const saveAgentPermissionMode = (mode: Exclude<AgentPermissionMode, 'mixed'>): void => {
    updateSettings(
      applyAgentPermissionMode({
        mode,
        agentDefaultArgs,
        agentDefaultEnv
      })
    )
  }

  // Why: null means detection is in flight, not "all agents are installed".
  // Showing the full catalog here makes the default-agent picker flash invalid
  // options while switching between Windows and WSL detection contexts.
  const detectedAgents =
    detectedIds === null ? [] : getAgentCatalog().filter((agent) => detectedIds.has(agent.id))
  const enabledDetectedAgents = detectedAgents.filter((agent) =>
    isTuiAgentEnabled(agent.id, disabledAgents)
  )
  const undetectedAgents = getAgentCatalog().filter(
    (a) => detectedIds !== null && !detectedIds.has(a.id)
  )

  // Why: 'blank' is an explicit no-agent preference, not an auto fallback,
  // so the Auto pill should only light up when the default is null OR when a
  // selected agent id is no longer detected on PATH.
  const isAutoDefault =
    defaultAgent === null ||
    (defaultAgent !== 'blank' &&
      (!detectedIds?.has(defaultAgent) || !isTuiAgentEnabled(defaultAgent, disabledAgents)))
  const isBlankDefault = defaultAgent === 'blank'

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SettingsSubsectionHeader
          title={translate('auto.components.settings.AgentsPane.385212c7a1', 'Default Agent')}
          description={agentOwnership.description}
        />

        <div className="flex flex-wrap gap-2">
          <DefaultAgentPill active={isAutoDefault} onClick={() => setDefault(null)}>
            {isAutoDefault && <Check className="size-3.5" />}
            {translate('auto.components.settings.AgentsPane.92033495ff', 'Auto')}
          </DefaultAgentPill>

          {/* Why: users who prefer to open a raw shell by default need a
              first-class "no agent" choice here — without it, the Auto pill
              is the closest option but silently launches the first detected
              agent, which is the opposite of what they want. */}
          <DefaultAgentPill active={isBlankDefault} onClick={() => setDefault('blank')}>
            <Terminal className="size-3.5" />
            {translate(
              'auto.components.settings.AgentsPane.110b74b022',
              'No agent (blank terminal)'
            )}
            {isBlankDefault && <Check className="size-3.5" />}
          </DefaultAgentPill>

          {enabledDetectedAgents.map((agent) => {
            const isActive = defaultAgent === agent.id
            return (
              <DefaultAgentPill
                key={agent.id}
                active={isActive}
                onClick={() => setDefault(agent.id)}
              >
                <AgentIcon agent={agent.id} size={14} />
                {agent.label}
                {isActive && <Check className="size-3.5" />}
              </DefaultAgentPill>
            )
          })}
        </div>
      </section>

      <AgentRuntimeSetting
        settings={settings}
        updateSettings={updateSettings}
        refresh={refresh}
        wslSupportedPlatform={wslSupportedPlatform}
        wslAvailable={wslAvailable}
        wslDistros={wslDistros}
        wslCapabilitiesLoading={wslCapabilitiesLoading}
      />

      <AgentStatusHooksSetting settings={settings} updateSettings={updateSettings} />

      <AgentGeneratedTabTitlesSetting settings={settings} updateSettings={updateSettings} />

      <AgentAwakeSetting settings={settings} updateSettings={updateSettings} />

      <AgentCacheTimerSection settings={settings} updateSettings={updateSettings} />

      <AgentPermissionsSetting mode={agentPermissionMode} onChange={saveAgentPermissionMode} />

      {detectedAgents.length > 0 && (
        <section className="space-y-3">
          <SettingsSubsectionHeader
            title={
              <span className="flex items-center gap-2">
                {translate('auto.components.settings.AgentsPane.02e0143be5', 'Installed')}
                <SettingsBadge tone="accent">
                  {detectedAgents.length}{' '}
                  {translate('auto.components.settings.AgentsPane.ed3e110e61', 'detected')}
                </SettingsBadge>
              </span>
            }
            action={
              <Button
                type="button"
                variant="quiet"
                size="xs"
                onClick={handleRefresh}
                disabled={isRefreshing}
                title={translate(
                  'auto.components.settings.AgentsPane.13647f9f80',
                  'Re-read your shell PATH and re-detect installed agents'
                )}
                className="h-7 gap-1.5 text-xs"
              >
                {isRefreshing ? (
                  <LoadingIndicator className="size-3" />
                ) : (
                  <RefreshCw className="size-3" />
                )}
                {isRefreshing
                  ? translate('auto.components.settings.AgentsPane.c9b33eb5c0', 'Refreshing…')
                  : translate('auto.components.settings.AgentsPane.0d9e293a02', 'Refresh')}
              </Button>
            }
          />

          <div className="divide-border/40 divide-y">
            {detectedAgents.map((agent) => (
              <AgentRow
                key={agent.id}
                agentId={agent.id}
                label={agent.label}
                homepageUrl={agent.homepageUrl}
                defaultCmd={agent.cmd}
                defaultArgs={getTuiAgentDefaultArgs(agent.id)}
                defaultEnv={getTuiAgentDefaultEnv(agent.id)}
                isDetected
                isEnabled={isTuiAgentEnabled(agent.id, disabledAgents)}
                isDefault={defaultAgent === agent.id}
                cmdOverride={cmdOverrides[agent.id]}
                argsOverride={resolveTuiAgentLaunchArgs(agent.id, agentDefaultArgs)}
                envOverride={resolveTuiAgentLaunchEnv(agent.id, agentDefaultEnv)}
                onSetDefault={() => setDefault(agent.id)}
                onSetEnabled={(enabled) => setAgentEnabled(agent.id, enabled)}
                onSaveOverride={(v) => saveOverride(agent.id, v)}
                onSaveArgs={(v) => saveAgentArgs(agent.id, v)}
                onSaveEnv={(v) => saveAgentEnv(agent.id, v)}
                sessionSourceHome={
                  agent.id === 'codex'
                    ? buildCodexSessionSourceHomeControl(settings, updateSettings)
                    : undefined
                }
              />
            ))}
          </div>
        </section>
      )}

      {undetectedAgents.length > 0 && (
        <section className="space-y-3">
          <SettingsSubsectionHeader
            title={
              <span className="text-muted-foreground flex items-center gap-2">
                {translate(
                  'auto.components.settings.AgentsPane.e8da2af684',
                  'Available to install'
                )}
                <SettingsBadge tone="muted">
                  {undetectedAgents.length}{' '}
                  {translate('auto.components.settings.AgentsPane.024bd95089', 'agents')}
                </SettingsBadge>
              </span>
            }
          />

          <div className="divide-border/40 divide-y">
            {undetectedAgents.map((agent) => (
              <AgentRow
                key={agent.id}
                agentId={agent.id}
                label={agent.label}
                homepageUrl={agent.homepageUrl}
                defaultCmd={agent.cmd}
                defaultArgs={getTuiAgentDefaultArgs(agent.id)}
                defaultEnv={getTuiAgentDefaultEnv(agent.id)}
                isDetected={false}
                isEnabled={isTuiAgentEnabled(agent.id, disabledAgents)}
                isDefault={false}
                cmdOverride={undefined}
                argsOverride={resolveTuiAgentLaunchArgs(agent.id, agentDefaultArgs)}
                envOverride={resolveTuiAgentLaunchEnv(agent.id, agentDefaultEnv)}
                onSetDefault={() => {}}
                onSetEnabled={(enabled) => setAgentEnabled(agent.id, enabled)}
                onSaveOverride={() => {}}
                onSaveArgs={(v) => saveAgentArgs(agent.id, v)}
                onSaveEnv={(v) => saveAgentEnv(agent.id, v)}
              />
            ))}
          </div>
        </section>
      )}

      {detectedIds === null && (
        <div className="border-border/50 text-muted-foreground flex items-center justify-center rounded-md border border-dashed py-6 text-sm">
          {translate(
            'auto.components.settings.AgentsPane.d83834f5e6',
            'Detecting installed agents…'
          )}
        </div>
      )}
    </div>
  )
}
