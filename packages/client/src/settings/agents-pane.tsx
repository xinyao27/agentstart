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
import { getAgentCatalog } from '~renderer/agent/catalog'
import { useDetectedAgents } from '~renderer/agent/use-detected'
import { translate } from '~renderer/i18n/i18n'
import {
  ActivityIcon,
  ArrowClockwise as RefreshCw,
  Clock,
  Download,
  Laptop,
  Package,
  Robot,
  ShieldCheck,
  Tag,
  Timer
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useAppStore } from '~renderer/store/state'

import { Button } from '../ui/button'
import { enqueueAgentAvailabilityUpdate } from './agent-availability'
import { AgentPermissionsSetting } from './agent-permissions-setting'
import { AgentRow } from './agent-row'
import { AgentGeneratedTabTitlesSetting, AgentStatusHooksSetting } from './agent-status-settings'
import { getAgentAwakeTitle } from './agent/awake-copy'
import { AgentAwakeSetting } from './agent/awake-setting'
import { getAgentCacheTimerSearchEntries } from './agent/cache-timer-search'
import { AgentCacheTimerSection } from './agent/cache-timer-section'
import { DefaultAgentPicker } from './agent/default-agent-picker'
import { getAgentGeneratedTabTitlesTitle } from './agent/generated-tab-title-copy'
import { AgentRuntimeSetting } from './agent/runtime-setting'
import { getAgentStatusHooksTitle } from './agent/status-hooks-copy'
import type { AgentsPaneProps } from './agents-pane-types'
import {
  getAgentsDefaultSearchEntries,
  getAgentsGeneratedTabTitlesSearchEntries,
  getAgentsAwakeSearchEntries,
  getAgentsPaneSearchEntries,
  getAgentsPermissionsSearchEntries,
  getAgentsRuntimeSearchEntries,
  getAgentsStatusHooksSearchEntries
} from './agents-search'
import { buildCodexSessionSourceHomeControl } from './codex-session-source-home-control'
import { SettingsBadge } from './form-controls'
import { SettingsGroupCards, type SettingsGroup } from './group-card'
import { getSettingOwnershipSummary } from './setting-ownership'

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

  const groups: SettingsGroup[] = [
    {
      id: 'agents-default',
      icon: <Robot aria-hidden="true" />,
      title: translate('auto.components.settings.AgentsPane.385212c7a1', 'Default Agent'),
      summary: agentOwnership.description,
      searchEntries: getAgentsDefaultSearchEntries(),
      content: (
        <DefaultAgentPicker
          defaultAgent={defaultAgent}
          detectedIds={detectedIds}
          disabledAgents={disabledAgents}
          enabledDetectedAgents={enabledDetectedAgents}
          onSetDefault={setDefault}
        />
      )
    }
  ]

  // Why: AgentRuntimeSetting self-hides off WSL platforms; gate the whole
  // group so those hosts don't get an empty card header instead.
  if (wslSupportedPlatform) {
    groups.push({
      id: 'agents-runtime',
      icon: <Laptop aria-hidden="true" />,
      title: translate('auto.components.settings.AgentRuntimeSetting.label', 'Agent runtime'),
      searchEntries: getAgentsRuntimeSearchEntries(),
      content: (
        <AgentRuntimeSetting
          settings={settings}
          updateSettings={updateSettings}
          refresh={refresh}
          wslSupportedPlatform={wslSupportedPlatform}
          wslAvailable={wslAvailable}
          wslDistros={wslDistros}
          wslCapabilitiesLoading={wslCapabilitiesLoading}
        />
      )
    })
  }

  groups.push(
    {
      id: 'agents-status-hooks',
      icon: <ActivityIcon aria-hidden="true" />,
      title: getAgentStatusHooksTitle(),
      searchEntries: getAgentsStatusHooksSearchEntries(),
      content: <AgentStatusHooksSetting settings={settings} updateSettings={updateSettings} />
    },
    {
      id: 'agents-generated-tab-titles',
      icon: <Tag aria-hidden="true" />,
      title: getAgentGeneratedTabTitlesTitle(),
      searchEntries: getAgentsGeneratedTabTitlesSearchEntries(),
      content: (
        <AgentGeneratedTabTitlesSetting settings={settings} updateSettings={updateSettings} />
      )
    },
    {
      id: 'agents-awake',
      icon: <Clock aria-hidden="true" />,
      title: getAgentAwakeTitle(),
      searchEntries: getAgentsAwakeSearchEntries(),
      content: <AgentAwakeSetting settings={settings} updateSettings={updateSettings} />
    },
    {
      id: 'agents-cache-timer',
      icon: <Timer aria-hidden="true" />,
      title: translate(
        'auto.components.settings.AgentCacheTimerSection.a137f8854d',
        'Prompt Cache Timer'
      ),
      summary: translate(
        'auto.components.settings.AgentCacheTimerSection.fe590653c1',
        'Claude caches your conversation to reduce costs. When idle too long the cache expires and the next message resends full context at higher cost. This shows a countdown so you know when to resume.'
      ),
      searchEntries: getAgentCacheTimerSearchEntries(),
      content: <AgentCacheTimerSection settings={settings} updateSettings={updateSettings} />
    },
    {
      id: 'agents-permissions',
      icon: <ShieldCheck aria-hidden="true" />,
      title: translate('auto.components.settings.AgentsPane.agentPermissions', 'Agent Permissions'),
      summary: translate(
        'auto.components.settings.AgentsPane.agentPermissionsDescription',
        'Choose whether AgentStart launches agents with fewer permission prompts or with manual checks.'
      ),
      searchEntries: getAgentsPermissionsSearchEntries(),
      content: (
        <AgentPermissionsSetting mode={agentPermissionMode} onChange={saveAgentPermissionMode} />
      )
    }
  )

  // Why: both list cards stay force-visible — before the accordion conversion
  // these sections always rendered, so search must never hide them either.
  if (detectedAgents.length > 0) {
    groups.push({
      id: 'agents-installed',
      icon: <Package aria-hidden="true" />,
      title: (
        <span className="flex items-center gap-2">
          {translate('auto.components.settings.AgentsPane.02e0143be5', 'Installed')}
          <SettingsBadge tone="accent">
            {detectedAgents.length}{' '}
            {translate('auto.components.settings.AgentsPane.ed3e110e61', 'detected')}
          </SettingsBadge>
        </span>
      ),
      searchEntries: getAgentsPaneSearchEntries(),
      forceVisible: true,
      content: (
        <div className="space-y-3">
          <div className="flex justify-end">
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
          </div>

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
        </div>
      )
    })
  }

  if (undetectedAgents.length > 0) {
    groups.push({
      id: 'agents-available',
      icon: <Download aria-hidden="true" />,
      title: (
        <span className="text-muted-foreground flex items-center gap-2">
          {translate('auto.components.settings.AgentsPane.e8da2af684', 'Available to install')}
          <SettingsBadge tone="muted">
            {undetectedAgents.length}{' '}
            {translate('auto.components.settings.AgentsPane.024bd95089', 'agents')}
          </SettingsBadge>
        </span>
      ),
      searchEntries: getAgentsPaneSearchEntries(),
      forceVisible: true,
      content: (
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
      )
    })
  }

  return (
    <div className="space-y-6">
      <SettingsGroupCards groups={groups} defaultOpenId="agents-default" />

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
