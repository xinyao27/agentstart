import { isTuiAgentEnabled } from '@yiru/protocol/agent/selection'
import type { TuiAgent } from '@yiru/protocol/agent/types'
import { useEffect, useState } from 'react'
import {
  detectAgentSessionContinuationAgents,
  launchAgentSessionContinuation
} from '~renderer/agent-session-continuation/launch-agent-session-continuation'
import { getAgentLabel } from '~renderer/agent/catalog'
import { getAgentCatalog } from '~renderer/agent/catalog'
import AgentCombobox from '~renderer/agent/combobox'
import { translate } from '~renderer/i18n/i18n'
import { ChatCentered as MessageSquarePlus } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'
import { Label } from '~renderer/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~renderer/ui/select'

import {
  buildAgentSessionContinuationPrompt,
  hasFullAgentSessionContext,
  type AgentSessionContinuationContextMode,
  type AgentSessionContinuationRequest
} from '../terminal-pane/agent/session-continuation'
import {
  AgentSessionContinuationLaunchOptions,
  buildContinuationSessionOptions,
  EMPTY_CONTINUATION_LAUNCH_OPTIONS,
  resolveContinuationLaunchOptionsForModel,
  type ContinuationLaunchOptions
} from './launch-options'
import { chooseInitialContinuationAgent } from './selection'

type AgentSessionContinuationDialogProps = {
  open: boolean
  request: AgentSessionContinuationRequest | null
  onOpenChange: (open: boolean) => void
}

type UserLaunchOptionsSelection = {
  worktreeId: string | null
  agent: TuiAgent | null
  options: ContinuationLaunchOptions
}

const EMPTY_DISABLED_AGENTS: TuiAgent[] = []
const EMPTY_DETECTED_AGENTS: TuiAgent[] = []

// Why: tagging the async result with the worktreeId it was fetched for lets detecting/failed
// states be derived by comparing the tag to the live request, instead of resetting them
// imperatively before the fetch starts.
type AgentDetectionResult =
  | { worktreeId: string; status: 'ready'; agents: TuiAgent[] }
  | { worktreeId: string; status: 'failed' }

type UserAgentSelection = { worktreeId: string | null; agent: TuiAgent | null }
type UserContextModeSelection = {
  worktreeId: string | null
  mode: AgentSessionContinuationContextMode
}

export function AgentSessionContinuationDialog({
  open,
  request,
  onOpenChange
}: AgentSessionContinuationDialogProps): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const [detectionResult, setDetectionResult] = useState<AgentDetectionResult | null>(null)
  const [userAgentSelection, setUserAgentSelection] = useState<UserAgentSelection | null>(null)
  const [userContextMode, setUserContextMode] = useState<UserContextModeSelection | null>(null)
  const [userLaunchOptions, setUserLaunchOptions] = useState<UserLaunchOptionsSelection | null>(
    null
  )
  const [starting, setStarting] = useState(false)
  const showStarting = starting
  const disabledAgents = settings?.disabledTuiAgents ?? EMPTY_DISABLED_AGENTS
  const requestWorktreeId = request?.worktreeId ?? null

  // Why: comparing the stored result's tag to the live request derives detecting/failed
  // instead of resetting them before the fetch — see AgentDetectionResult above.
  const activeDetection =
    detectionResult && detectionResult.worktreeId === requestWorktreeId ? detectionResult : null
  const detecting = Boolean(open && request) && activeDetection === null
  const detectionFailed = activeDetection?.status === 'failed'
  const rawDetectedAgents =
    activeDetection?.status === 'ready' ? activeDetection.agents : EMPTY_DETECTED_AGENTS

  const enabledDetectedAgents = (() =>
    rawDetectedAgents.filter((agent) => isTuiAgentEnabled(agent, disabledAgents)))()
  const agents = (() =>
    getAgentCatalog().filter((agent) => enabledDetectedAgents.includes(agent.id)))()
  const hasFullContext = request ? hasFullAgentSessionContext(request.source) : false
  // Why: reached from the composer's Agent/model switch, the session may have
  // nothing to hand off yet — offering a context mode would claim otherwise.
  const hasAnyContext = request
    ? buildAgentSessionContinuationPrompt(request.source, 'focused') !== null
    : false

  const autoPickedAgent = (() =>
    request
      ? chooseInitialContinuationAgent({
          availableAgents: enabledDetectedAgents,
          sourceAgent: request.source.sourceAgent,
          defaultAgent: settings?.defaultTuiAgent
        })
      : null)()
  // Why: the user's pick is tagged by worktreeId so it survives re-renders (disabledAgents or
  // settings changing) but still yields to a fresh auto-pick once a different request arrives.
  const selectedAgent =
    userAgentSelection && userAgentSelection.worktreeId === requestWorktreeId
      ? userAgentSelection.agent
      : autoPickedAgent
  const contextMode =
    userContextMode && userContextMode.worktreeId === requestWorktreeId
      ? userContextMode.mode
      : 'focused'
  // Why: tagged by agent as well as request, so switching Agent reseeds the
  // model and option picks from that agent's own catalog without a reset step.
  const launchOptions = (() => {
    if (
      userLaunchOptions &&
      userLaunchOptions.worktreeId === requestWorktreeId &&
      userLaunchOptions.agent === selectedAgent
    ) {
      return userLaunchOptions.options
    }
    return selectedAgent
      ? resolveContinuationLaunchOptionsForModel(selectedAgent, null)
      : EMPTY_CONTINUATION_LAUNCH_OPTIONS
  })()

  useEffect(() => {
    if (!open || !request) {
      return
    }
    let cancelled = false
    const { worktreeId } = request
    void detectAgentSessionContinuationAgents(worktreeId)
      .then((detected) => {
        if (!cancelled) {
          setDetectionResult({ worktreeId, status: 'ready', agents: detected })
        }
      })
      .catch((error) => {
        console.error('Agent detection failed for continuation dialog', error)
        if (!cancelled) {
          setDetectionResult({ worktreeId, status: 'failed' })
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, request])

  const handleStart = async (): Promise<void> => {
    if (!request || !selectedAgent || starting) {
      return
    }
    // Why: an Agent or model switch is valid before the session has produced
    // anything to carry over, so an empty handoff still launches.
    const prompt = buildAgentSessionContinuationPrompt(request.source, contextMode) ?? ''
    setStarting(true)
    const sessionOptions = buildContinuationSessionOptions(launchOptions)
    const launched = await launchAgentSessionContinuation({
      agent: selectedAgent,
      prompt,
      worktreeId: request.worktreeId,
      groupId: request.groupId,
      workspacePath: request.workspacePath,
      initialCwd: request.initialCwd,
      launchSource: request.launchSource,
      ...(sessionOptions ? { sessionOptions } : {})
    })
    setStarting(false)
    if (launched) {
      onOpenChange(false)
    }
  }

  const sourceName = request?.source.sourceTitle?.trim()
  const sourceAgentLabel = request?.source.sourceAgent
    ? getAgentLabel(request.source.sourceAgent)
    : null
  const startDisabled = detecting || starting || agents.length === 0 || !selectedAgent
  const focusedContextLabel = translate(
    'components.agentSessionContinuation.modeFocused',
    'Focused handoff (Recommended)'
  )
  const fullContextLabel = translate(
    'components.agentSessionContinuation.modeFull',
    'Full session transcript'
  )
  const selectedContextLabel = contextMode === 'focused' ? focusedContextLabel : fullContextLabel

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!starting) {
          onOpenChange(nextOpen)
        }
      }}
    >
      <DialogContent className="min-w-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <MessageSquarePlus className="size-4" />
            {translate(
              'components.agentSessionContinuation.dialogTitle',
              'Continue in New Session'
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {translate(
              'components.agentSessionContinuation.dialogDescription',
              'Start a fresh Agent session from this stopping point. The original session stays unchanged.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <div className="bg-card min-w-0 border px-3 py-2">
            <div className="truncate text-xs font-medium">
              {sourceName ||
                translate('components.agentSessionContinuation.untitledSession', 'Current session')}
            </div>
            {sourceAgentLabel ? (
              <div className="text-muted-foreground mt-0.5 text-[11px]">
                {translate(
                  'components.agentSessionContinuation.originalAgent',
                  'Original Agent: {{agent}}',
                  { agent: sourceAgentLabel }
                )}
              </div>
            ) : null}
          </div>

          <div className="min-w-0 space-y-2">
            <Label>{translate('components.agentSessionContinuation.agent', 'Agent')}</Label>
            <AgentCombobox
              agents={agents}
              value={selectedAgent}
              onValueChange={(agent) =>
                setUserAgentSelection({ worktreeId: requestWorktreeId, agent })
              }
              allowBlankTerminal={false}
              allowNarrowTrigger
              emptyLabel={translate(
                'components.agentSessionContinuation.selectAgent',
                'Select an Agent'
              )}
              triggerClassName="min-w-0 w-full"
            />
            {detecting ? (
              <p className="text-muted-foreground text-[11px]">
                {translate(
                  'components.agentSessionContinuation.detectingAgents',
                  'Detecting Agents on this workspace host…'
                )}
              </p>
            ) : detectionFailed ? (
              <p className="text-destructive text-[11px]">
                {translate(
                  'components.agentSessionContinuation.detectionFailed',
                  'Could not detect Agents on this workspace host.'
                )}
              </p>
            ) : agents.length === 0 ? (
              <p className="text-muted-foreground text-[11px]">
                {translate(
                  'components.agentSessionContinuation.noAgents',
                  'No enabled Agents were detected on this workspace host.'
                )}
              </p>
            ) : null}
          </div>

          {selectedAgent ? (
            <AgentSessionContinuationLaunchOptions
              agent={selectedAgent}
              options={launchOptions}
              onChange={(next) =>
                setUserLaunchOptions({
                  worktreeId: requestWorktreeId,
                  agent: selectedAgent,
                  options: next
                })
              }
              disabled={starting}
            />
          ) : null}

          <div className={hasAnyContext ? 'min-w-0 space-y-2' : 'hidden'}>
            <Label>{translate('components.agentSessionContinuation.context', 'Context')}</Label>
            <Select
              value={contextMode}
              onValueChange={(value) =>
                setUserContextMode({
                  worktreeId: requestWorktreeId,
                  mode: value as AgentSessionContinuationContextMode
                })
              }
            >
              <SelectTrigger className="w-full min-w-0" size="sm">
                <SelectValue>{selectedContextLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="focused">{focusedContextLabel}</SelectItem>
                <SelectItem value="full" disabled={!hasFullContext}>
                  {fullContextLabel}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-[11px] leading-4">
              {contextMode === 'focused'
                ? translate(
                    'components.agentSessionContinuation.modeFocusedDescription',
                    'Uses the latest status and current workspace, reading older transcript details only when needed.'
                  )
                : translate(
                    'components.agentSessionContinuation.modeFullDescription',
                    'Asks the new Agent to read the complete saved session before continuing. This can take longer and use significant context, plan usage, or API credits.'
                  )}
            </p>
          </div>

          {request?.initialCwd ? (
            <div className="text-muted-foreground text-[11px]">
              {translate('components.agentSessionContinuation.startsIn', 'Starts in:')}{' '}
              <span className="text-foreground/80 font-mono break-all">{request.initialCwd}</span>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={starting}
            onClick={() => onOpenChange(false)}
          >
            {translate('components.agentSessionContinuation.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            autoFocus
            disabled={startDisabled}
            onClick={() => void handleStart()}
          >
            {showStarting ? <LoadingIndicator className="size-3.5" /> : null}
            {starting
              ? translate('components.agentSessionContinuation.starting', 'Starting…')
              : translate('components.agentSessionContinuation.startSession', 'Start New Session')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
