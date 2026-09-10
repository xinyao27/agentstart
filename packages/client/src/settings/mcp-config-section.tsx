import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '@agentstart/protocol/host/identity'
import type { Repo } from '@agentstart/protocol/project/repository'
import { getRepoIdFromWorktreeId } from '@agentstart/protocol/worktree/identity'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import {
  WarningCircle as AlertCircle,
  FileCode as FileCode2,
  Plus,
  ArrowClockwise as RefreshCw
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import {
  canInspectLocalMcpConfigRoot,
  inspectMcpConfigContent,
  MCP_CONFIG_CANDIDATES,
  MCP_STARTER_CONFIG
} from '~renderer/mcp-config'
import { joinPath } from '~renderer/path'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { getRuntimeEnvironmentIdForRepo } from '~renderer/repo/runtime-owner'
import { extractRuntimeErrorMessage } from '~renderer/runtime/error-message'
import { writeRuntimeFile, type RuntimeFileOperationArgs } from '~renderer/runtime/file-client'
import { shellClient } from '~renderer/runtime/shell-client'
import { useWorktreesForRepo } from '~renderer/store/selectors'
import { useAppStore } from '~renderer/store/state'

import { isWindowsUserAgent } from '../terminal-pane/pane-interactions'
import { Button } from '../ui/button'
import { McpConfigFileRow, type LoadedMcpConfigInspection } from './mcp-config-file-row'
import { loadMcpConfigInspections } from './mcp-config-inspection'
import { McpMissingConfigList } from './mcp-missing-config-list'

type McpConfigSectionProps = {
  repo: Repo
}

function countServers(configs: LoadedMcpConfigInspection[]): number {
  return configs.reduce((sum, config) => sum + config.servers.length, 0)
}

export function McpConfigSection({ repo }: McpConfigSectionProps): React.JSX.Element {
  const openFile = useAppStore((state) => state.openFile)
  const setActiveView = useAppStore((state) => state.setActiveView)
  const setActiveWorktree = useAppStore((state) => state.setActiveWorktree)
  const ensureWorktreeRootGroup = useAppStore((state) => state.ensureWorktreeRootGroup)
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const settings = useAppStore((state) => state.settings)
  const allWorktreesForRepo = useWorktreesForRepo(repo.id)
  const [configs, setConfigs] = useState<LoadedMcpConfigInspection[]>([])
  const [loading, setLoading] = useState(true)
  const [createConfirm, setCreateConfirm] = useState(false)
  const createConfirmResetTimerRef = useRef<number | null>(null)
  const mountedRef = useMountedRef()
  const [inspectionUnavailableMessage, setInspectionUnavailableMessage] = useState<string | null>(
    null
  )

  const isLocalRepo = getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID
  const repoHostId = getRepoExecutionHostId(repo)
  const worktreesForRepo = (() =>
    allWorktreesForRepo.filter(
      (worktree) => (worktree.hostId ?? LOCAL_EXECUTION_HOST_ID) === repoHostId
    ))()
  const isWindows = isWindowsUserAgent()
  const targetWorktree = (() => {
    if (activeWorktreeId && getRepoIdFromWorktreeId(activeWorktreeId) === repo.id) {
      const activeWorktree = worktreesForRepo.find((worktree) => worktree.id === activeWorktreeId)
      if (activeWorktree) {
        return activeWorktree
      }
    }
    return (
      worktreesForRepo.find((worktree) => worktree.isMainWorktree) ??
      worktreesForRepo.find((worktree) => worktree.path === repo.path) ??
      worktreesForRepo[0] ?? { id: `${repo.id}::${repo.path}`, path: repo.path }
    )
  })()
  const targetWorktreeId = targetWorktree.id
  const targetRootPath = targetWorktree.path
  const runtimeContext = ((): RuntimeFileOperationArgs => ({
    settings: {
      activeRuntimeEnvironmentId: getRuntimeEnvironmentIdForRepo(
        { repos: [repo], settings },
        repo.id
      )
    },
    worktreeId: targetWorktreeId,
    worktreePath: targetRootPath
  }))()
  const detectedCount = (() => configs.filter((config) => config.exists).length)()
  const inspectionUnavailable = inspectionUnavailableMessage !== null
  const visibleConfigs = (() =>
    inspectionUnavailable
      ? []
      : configs.filter(
          (config) => config.exists || config.status === 'invalid' || config.readError
        ))()
  const missingConfigs = (() =>
    configs.filter(
      (config) => !config.exists && config.status === 'missing' && !config.readError
    ))()
  const missingInspections = (() =>
    MCP_CONFIG_CANDIDATES.map((candidate): LoadedMcpConfigInspection => ({
      ...inspectMcpConfigContent(candidate, null),
      absolutePath: joinPath(targetRootPath, candidate.relativePath)
    })))()
  const serverCount = (() => countServers(configs))()
  const canCreateStarter = detectedCount === 0 && !inspectionUnavailable

  const loadConfigs = useEventCallback(async (): Promise<void> => {
    if (!mountedRef.current) {
      return
    }
    setLoading(true)
    setInspectionUnavailableMessage(null)

    try {
      if (isLocalRepo && !canInspectLocalMcpConfigRoot(targetRootPath, isWindows)) {
        if (mountedRef.current) {
          setConfigs(missingInspections)
          setInspectionUnavailableMessage('This workspace path is not available from this host.')
        }
        return
      }

      if (isLocalRepo && !(await shellClient.shell.pathExists(targetRootPath))) {
        if (mountedRef.current) {
          setConfigs(missingInspections)
          setInspectionUnavailableMessage('This workspace path is not available on disk.')
        }
        return
      }

      const next = await loadMcpConfigInspections(targetRootPath, runtimeContext)
      if (mountedRef.current) {
        setConfigs(next)
      }
    } catch (error) {
      if (mountedRef.current) {
        setConfigs(missingInspections)
        setInspectionUnavailableMessage(
          extractRuntimeErrorMessage(error, 'Unable to inspect MCP configs.')
        )
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  })

  const clearCreateConfirmResetTimer = useEventCallback((): void => {
    if (createConfirmResetTimerRef.current !== null) {
      window.clearTimeout(createConfirmResetTimerRef.current)
      createConfirmResetTimerRef.current = null
    }
  })

  useEffect(() => {
    void loadConfigs()
    return clearCreateConfirmResetTimer
  }, [clearCreateConfirmResetTimer, loadConfigs])

  const handleOpen = (config: LoadedMcpConfigInspection): void => {
    setActiveWorktree(targetWorktreeId)
    const targetGroupId = ensureWorktreeRootGroup(targetWorktreeId)
    openFile(
      {
        filePath: config.absolutePath,
        relativePath: config.candidate.relativePath,
        worktreeId: targetWorktreeId,
        language: 'json',
        mode: 'edit'
      },
      { targetGroupId }
    )
    setActiveView('terminal')
  }

  const handleCreateStarter = async (): Promise<void> => {
    if (!createConfirm) {
      clearCreateConfirmResetTimer()
      setCreateConfirm(true)
      createConfirmResetTimerRef.current = window.setTimeout(() => {
        createConfirmResetTimerRef.current = null
        if (mountedRef.current) {
          setCreateConfirm(false)
        }
      }, 3000)
      return
    }

    const target = joinPath(targetRootPath, '.mcp.json')
    try {
      // Why: v1 only creates the root workspace config so we do not need to
      // guess per-agent directory layouts or mutate agent-specific files.
      await writeRuntimeFile(runtimeContext, target, MCP_STARTER_CONFIG)
      clearCreateConfirmResetTimer()
      if (mountedRef.current) {
        setCreateConfirm(false)
      }
      await loadConfigs()
      setActiveWorktree(targetWorktreeId)
      const targetGroupId = ensureWorktreeRootGroup(targetWorktreeId)
      openFile(
        {
          filePath: target,
          relativePath: '.mcp.json',
          worktreeId: targetWorktreeId,
          language: 'json',
          mode: 'edit'
        },
        { targetGroupId }
      )
      setActiveView('terminal')
      toast.success(
        translate('auto.components.settings.McpConfigSection.1f3665e35a', 'MCP config created'),
        {
          description: translate(
            'auto.components.settings.McpConfigSection.9ee215caf6',
            '.mcp.json'
          )
        }
      )
    } catch (error) {
      toast.error(extractRuntimeErrorMessage(error, 'Failed to create MCP config.'))
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">
            {translate('auto.components.settings.McpConfigSection.55eea3ef47', 'MCP Configs')}
          </h3>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.McpConfigSection.96f5609b04',
              'Inspect MCP server definitions that agents can use while working in this repo.'
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void loadConfigs()}
            aria-label={translate(
              'auto.components.settings.McpConfigSection.f34c152dc0',
              'Refresh MCP configs'
            )}
          >
            {loading ? (
              <LoadingIndicator className="size-3.5" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </Button>
          {canCreateStarter ? (
            <Button
              variant={createConfirm ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5"
              onClick={() => void handleCreateStarter()}
            >
              <Plus className="size-3.5" />
              {createConfirm
                ? translate(
                    'auto.components.settings.McpConfigSection.0a5c1ead54',
                    'Create empty config'
                  )
                : translate(
                    'auto.components.settings.McpConfigSection.82436439eb',
                    'Add MCP config'
                  )}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="border-border/50 bg-muted/20 rounded-md border">
        <div className="border-border/50 text-muted-foreground flex items-center justify-between border-b px-3 py-2 text-xs">
          <span>
            {detectedCount}{' '}
            {translate('auto.components.settings.McpConfigSection.251b96564a', 'detected ·')}{' '}
            {serverCount}{' '}
            {translate('auto.components.settings.McpConfigSection.3b224167ff', 'server')}
            {serverCount === 1 ? '' : 's'}
          </span>
          {loading ? <LoadingIndicator className="size-3.5" /> : null}
        </div>
        <div>
          {visibleConfigs.length === 0 ? (
            <div className="text-muted-foreground flex items-start gap-2 px-3 py-2.5 text-xs">
              {inspectionUnavailable ? (
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              ) : (
                <FileCode2 className="mt-0.5 size-3.5 shrink-0" />
              )}
              {inspectionUnavailable ? (
                <span>{inspectionUnavailableMessage}</span>
              ) : (
                <span>
                  {translate(
                    'auto.components.settings.McpConfigSection.b900cd6282',
                    'No MCP config found. Add an empty workspace config when you want this repo to define its own MCP servers.'
                  )}
                </span>
              )}
            </div>
          ) : (
            <div className="divide-border/50 divide-y">
              {visibleConfigs.map((config) => (
                <McpConfigFileRow
                  key={config.candidate.relativePath}
                  config={config}
                  onOpen={handleOpen}
                />
              ))}
            </div>
          )}

          {!inspectionUnavailable ? <McpMissingConfigList missingConfigs={missingConfigs} /> : null}
        </div>
      </div>
    </section>
  )
}
