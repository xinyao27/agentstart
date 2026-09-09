import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { useEventCallback } from '~renderer/react/use-event-callback'
import {
  killRuntimeDaemonSession,
  listRuntimeDaemonSessions,
  type RuntimeDaemonSession
} from '~renderer/runtime/daemon-sessions-client'
import { useAppStore } from '~renderer/store/state'
import { activateTabAndFocusPane } from '~renderer/tab-bar/activate-and-focus-pane'
import { activateAndRevealWorktree } from '~renderer/worktree/activation'

import { useDaemonActions, DaemonActionDialog } from '../daemon-actions/use-actions'
import { ManageSessionKillDialog } from './manage-session-kill-dialog'
import { ManageSessionsTable } from './manage-sessions-table'
import { SearchableSetting } from './searchable-setting'
import { getManageSessionsSearchEntries } from './terminal/search'

type ConfirmKind = 'killOne'

export function ManageSessionsSection(): React.JSX.Element {
  const [sessions, setSessions] = useState<RuntimeDaemonSession[]>([])
  const [isRefreshing, setIsRefreshing] = useState(true)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [pendingKillSession, setPendingKillSession] = useState<RuntimeDaemonSession | null>(null)
  const [busyKind, setBusyKind] = useState<ConfirmKind | null>(null)
  const optimisticRollback = useRef<RuntimeDaemonSession[] | null>(null)
  const isMounted = useRef(true)
  const mutationInFlight = useRef(false)

  const tabsByWorktree = useAppStore((s) => s.tabsByWorktree)
  const ptyIdsByTabId = useAppStore((s) => s.ptyIdsByTabId)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const closeSettingsPage = useAppStore((s) => s.closeSettingsPage)

  const ptyIdToTabId = (() => {
    const map = new Map<string, string>()
    for (const [tabId, ptyIds] of Object.entries(ptyIdsByTabId)) {
      for (const ptyId of ptyIds) {
        map.set(ptyId, tabId)
      }
    }
    return map
  })()

  const tabIdToWorktreeId = (() => {
    const map = new Map<string, string>()
    for (const [worktreeId, tabs] of Object.entries(tabsByWorktree)) {
      for (const tab of tabs) {
        map.set(tab.id, worktreeId)
      }
    }
    return map
  })()

  const handleNavigate = (tabId: string) => {
    const worktreeId = tabIdToWorktreeId.get(tabId)
    if (worktreeId) {
      activateAndRevealWorktree(worktreeId)
    }
    setActiveView('terminal')
    activateTabAndFocusPane(tabId, null)
    closeSettingsPage()
  }

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  const refresh = useEventCallback(async (): Promise<RuntimeDaemonSession[]> => {
    setIsRefreshing(true)
    try {
      const result = await listRuntimeDaemonSessions()
      if (!isMounted.current || mutationInFlight.current) {
        return result.sessions
      }
      setSessions(result.sessions)
      return result.sessions
    } catch (err) {
      console.error('[manage-sessions] listSessions failed', err)
      if (isMounted.current && !mutationInFlight.current) {
        toast.error(
          translate(
            'auto.components.settings.ManageSessionsSection.c535cbdd09',
            'Couldn’t load sessions.'
          ),
          {
            description: err instanceof Error ? err.message : undefined
          }
        )
      }
      return []
    } finally {
      if (isMounted.current) {
        setIsRefreshing(false)
        setHasLoadedOnce(true)
      }
    }
  })

  useEffect(() => {
    void refresh()
  }, [refresh])

  const sessionCount = sessions.length

  const daemonActions = useDaemonActions({
    onKillAllStart: () => {
      mutationInFlight.current = true
      optimisticRollback.current = sessions
      setSessions([])
    },
    onKillAllError: () => {
      if (isMounted.current && optimisticRollback.current) {
        setSessions(optimisticRollback.current)
      }
    },
    onKillAllSettled: () => {
      optimisticRollback.current = null
      mutationInFlight.current = false
      void refresh()
    },
    onRestartSettled: () => {
      void refresh()
    }
  })

  const handleKillOne = async (session: RuntimeDaemonSession) => {
    setBusyKind('killOne')
    mutationInFlight.current = true
    try {
      const { success } = await killRuntimeDaemonSession(session.sessionId)
      if (success) {
        toast.success(
          translate('auto.components.settings.ManageSessionsSection.bfba05dccd', 'Killed session.')
        )
      } else {
        toast.error(
          translate(
            'auto.components.settings.ManageSessionsSection.0735b7a586',
            'Couldn’t kill session — it may already be gone.'
          )
        )
      }
      mutationInFlight.current = false
      await refresh()
    } catch (err) {
      toast.error(
        translate(
          'auto.components.settings.ManageSessionsSection.8dbd96b463',
          'Couldn’t kill session.'
        ),
        {
          description: err instanceof Error ? err.message : undefined
        }
      )
    } finally {
      mutationInFlight.current = false
      if (isMounted.current) {
        setBusyKind(null)
        setPendingKillSession(null)
      }
    }
  }

  const runConfirmed = () => {
    if (!pendingKillSession) {
      return
    }
    void handleKillOne(pendingKillSession)
  }

  const isBusy = busyKind !== null || daemonActions.isBusy

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">
          {translate(
            'auto.components.settings.ManageSessionsSection.d1b80fd5cd',
            'Manage Sessions'
          )}
        </h3>
        <p className="text-muted-foreground text-xs">
          {translate(
            'auto.components.settings.ManageSessionsSection.7c4889a724',
            'Recover from a frozen or misbehaving terminal by killing sessions or restarting the underlying daemon.'
          )}
        </p>
      </div>

      <SearchableSetting
        title={getManageSessionsSearchEntries()[0].title}
        description={getManageSessionsSearchEntries()[0].description}
        keywords={getManageSessionsSearchEntries()[0].keywords}
        className="space-y-3"
      >
        <ManageSessionsTable
          sessions={sessions}
          hasLoadedOnce={hasLoadedOnce}
          sessionCount={sessionCount}
          isBusy={isBusy}
          isRefreshing={isRefreshing}
          daemonBusyKind={daemonActions.busyKind}
          ptyIdToTabId={ptyIdToTabId}
          onRefresh={() => void refresh()}
          onKillAll={() => daemonActions.setPending('killAll')}
          onRestartDaemon={() => daemonActions.setPending('restart')}
          onNavigate={handleNavigate}
          onRequestKill={setPendingKillSession}
        />
      </SearchableSetting>

      <ManageSessionKillDialog
        session={pendingKillSession}
        isBusy={isBusy}
        onCancel={() => setPendingKillSession(null)}
        onConfirm={runConfirmed}
      />
      <DaemonActionDialog api={daemonActions} />
    </section>
  )
}
