import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useWorktreeAgentPhase } from '~renderer/agent-session/presence'
import { translate } from '~renderer/i18n/i18n'
import { Circle, FloppyDisk, Play, StopCircle } from '~renderer/icons/hugeicons'
import { requireArtifactClient } from '~renderer/runtime/artifact-target'
import { openBrowserReplayTarget } from '~renderer/runtime/browser-replay-target'
import { Button } from '~renderer/ui/button'

import { getExtensionBrowserCapabilities } from '../browser-capabilities'
import { terminalsQuery, worktreesQuery } from '../runtime/queries'
import { uploadBrowserArtifact } from './artifact-upload'

type ReplayControlsProps = {
  pageUrl: string
  projectId: string
  worktreeId: string
}

const RECORDINGS_QUERY_KEY = ['extension-host', 'browser-replay-recordings'] as const

async function openReplayClientOrThrow() {
  const client = await openBrowserReplayTarget()
  if (!client) {
    throw new Error('browser_replay_protocol_unavailable')
  }
  return client
}

export function ReplayControls({
  pageUrl,
  projectId,
  worktreeId
}: ReplayControlsProps): React.JSX.Element {
  const capabilities = getExtensionBrowserCapabilities()
  const queryClient = useQueryClient()
  const recordings = useQuery({
    queryKey: RECORDINGS_QUERY_KEY,
    queryFn: async () => (await openReplayClientOrThrow()).list({ limit: 5, projectId }),
    refetchInterval: 30_000
  })
  const recordingStatus = useQuery({
    queryKey: ['extension-host', 'recording-status', pageUrl],
    queryFn: capabilities.isRecording,
    refetchInterval: 1_000
  })
  const terminals = useQuery(terminalsQuery)
  const worktrees = useQuery({ ...worktreesQuery(projectId), refetchInterval: 2_000 })
  const workbenchAgentPhase = useWorktreeAgentPhase(worktreeId)
  const head =
    worktrees.data?.worktrees.find((worktree) => worktree.id === worktreeId)?.head ?? null
  const hasActiveAgent =
    (workbenchAgentPhase !== null && workbenchAgentPhase !== 'complete') ||
    (terminals.data?.terminals ?? []).some(
      (terminal) =>
        terminal.worktreeId === worktreeId &&
        terminal.agentPhase !== null &&
        terminal.agentPhase !== undefined &&
        terminal.agentPhase !== 'complete'
    )
  const previousHead = useRef<string | null | undefined>(undefined)
  const previousAgentState = useRef<boolean | undefined>(undefined)
  const lastAutomaticReplay = useRef<string | null>(null)
  const start = useMutation({
    mutationFn: async () => {
      const granted = await capabilities.hasBrowserControlAccess()
      if (!granted) {
        throw new Error('browser_control_unavailable')
      }
      await capabilities.startRecording()
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['extension-host', 'recording-status', pageUrl]
      })
    }
  })
  const stop = useMutation({
    mutationFn: async () => {
      const capture = await capabilities.stopRecording()
      if (!capture) {
        throw new Error('recording_not_active')
      }
      const { video, ...timeline } = capture
      const videoArtifactId = video
        ? await uploadBrowserArtifact({
            blob: video,
            fileName: `browser-replay-${new Date().toISOString().replaceAll(':', '-')}.webm`,
            projectId
          })
        : undefined
      return (await openReplayClientOrThrow()).save({ ...timeline, projectId, videoArtifactId })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: RECORDINGS_QUERY_KEY }),
        queryClient.invalidateQueries({
          queryKey: ['extension-host', 'recording-status', pageUrl]
        })
      ])
    }
  })
  const replay = useMutation({
    mutationFn: async (recordingId: string) => {
      const recording = recordings.data?.find((candidate) => candidate.id === recordingId)
      if (!recording) {
        throw new Error('recording_missing')
      }
      const granted = await capabilities.hasBrowserControlAccess()
      if (!granted) {
        throw new Error('browser_control_unavailable')
      }
      try {
        await capabilities.replay(recording.events)
        await (
          await openReplayClientOrThrow()
        ).recordResult({
          detail: 'Replay completed without a CDP interaction error.',
          pageUrl,
          projectId,
          recordingId,
          success: true,
          worktreeId
        })
      } catch (error) {
        await (
          await openReplayClientOrThrow()
        ).recordResult({
          detail: replayFailureDetail(error),
          pageUrl,
          projectId,
          recordingId,
          success: false,
          worktreeId
        })
        throw error
      }
    }
  })
  const latestRecordingId = recordings.data?.[0]?.id ?? null
  useEffect(() => {
    const wasActive = previousAgentState.current
    const priorHead = previousHead.current
    previousAgentState.current = hasActiveAgent
    previousHead.current = head
    if (wasActive === undefined || priorHead === undefined || !latestRecordingId) {
      return
    }
    const iterationFinished = wasActive && !hasActiveAgent
    const codeChanged = Boolean(head && priorHead && head !== priorHead)
    if (!iterationFinished && !codeChanged) {
      return
    }
    const trigger = `${latestRecordingId}:${head ?? 'no-head'}:${hasActiveAgent ? 'active' : 'idle'}`
    if (lastAutomaticReplay.current === trigger || replay.isPending) {
      return
    }
    lastAutomaticReplay.current = trigger
    replay.mutate(latestRecordingId)
  }, [hasActiveAgent, head, latestRecordingId, replay])
  const download = useMutation({
    mutationFn: async (id: string) => {
      const ticket = await (await requireArtifactClient()).downloadTicket(id)
      await capabilities.downloadArtifact({ id, ticket: ticket.ticket })
    }
  })
  const isBusy = start.isPending || stop.isPending || replay.isPending || download.isPending
  const error = start.error ?? stop.error ?? replay.error ?? download.error

  return (
    <div className="border-sidebar-border ml-6 border-l px-2 py-1.5">
      <div className="flex items-center gap-1">
        {recordingStatus.data ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={isBusy}
            onClick={() => stop.mutate()}
          >
            <StopCircle />
            {translate('extension.replay.stop', 'Stop and save')}
          </Button>
        ) : (
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={isBusy}
            onClick={() => start.mutate()}
          >
            <Circle className="text-destructive fill-current" />
            {translate('extension.replay.record', 'Record flow')}
          </Button>
        )}
        <span className="text-muted-foreground text-xs">
          {recordingStatus.data
            ? translate('extension.replay.recording', 'Recording this local preview')
            : translate('extension.replay.ready', 'Local preview')}
        </span>
      </div>
      {(recordings.data ?? []).map((recording) => (
        <div key={recording.id} className="flex items-center">
          <Button
            type="button"
            size="sidebar-row"
            variant="ghost"
            className="min-w-0 flex-1"
            disabled={isBusy}
            onClick={() => replay.mutate(recording.id)}
          >
            <Play />
            <span className="min-w-0 flex-1 truncate">
              {recording.pageTitle || translate('extension.replay.untitled', 'Recorded flow')}
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {translate('extension.replay.eventCount', '{{count}} steps', {
                count: recording.events.length
              })}
            </span>
          </Button>
          {recording.videoArtifactId ? (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={translate('extension.replay.downloadVideo', 'Download recording video')}
              disabled={isBusy}
              onClick={() => download.mutate(recording.videoArtifactId ?? '')}
            >
              <FloppyDisk />
            </Button>
          ) : null}
        </div>
      ))}
      {error ? (
        <p className="text-destructive pt-1 text-xs">
          {translate('extension.replay.failed', 'Chrome could not complete the recording action.')}
        </p>
      ) : null}
    </div>
  )
}

function replayFailureDetail(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error)
  return detail.slice(0, 4_096)
}
