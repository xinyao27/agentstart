import { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import type { AgentStartHookScriptKind } from '~renderer/sidebar/agentstart-hook-trust'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { Checkbox } from '~renderer/ui/checkbox'
import { cn } from '~renderer/ui/class-names'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'

type ScriptKind = AgentStartHookScriptKind

const SCRIPT_KIND_LABEL: Record<ScriptKind, string> = {
  setup: 'setup script',
  archive: 'archive script'
}

const SCRIPT_KIND_TRIGGER: Record<ScriptKind, string> = {
  setup: 'when this workspace is created',
  archive: 'when this workspace is removed'
}

const AgentStartYamlTrustDialog = function AgentStartYamlTrustDialog() {
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const markAgentStartHookScriptConfirmed = useAppStore((s) => s.markAgentStartHookScriptConfirmed)
  const markAgentStartHookRepoAlwaysTrusted = useAppStore(
    (s) => s.markAgentStartHookRepoAlwaysTrusted
  )

  const isOpen = activeModal === 'confirm-agentstart-yaml-hooks'
  const [alwaysTrustState, setAlwaysTrustState] = useState(() => ({
    isOpen,
    value: false
  }))

  // Why: never show a stale "always trust" choice on a new hook prompt.
  // Resetting during render avoids one paint with the old decision checked.
  if (alwaysTrustState.isOpen !== isOpen) {
    setAlwaysTrustState({ isOpen, value: false })
  }
  const alwaysTrust = alwaysTrustState.isOpen === isOpen ? alwaysTrustState.value : false
  const setAlwaysTrust = (value: boolean): void => {
    setAlwaysTrustState({ isOpen, value })
  }

  const repoId = typeof modalData.repoId === 'string' ? modalData.repoId : ''
  const repoName = typeof modalData.repoName === 'string' ? modalData.repoName : 'this repository'
  const scriptKind: ScriptKind = modalData.scriptKind === 'archive' ? 'archive' : 'setup'
  const scriptContent = typeof modalData.scriptContent === 'string' ? modalData.scriptContent : ''
  const contentHash = typeof modalData.contentHash === 'string' ? modalData.contentHash : ''
  const previouslyApproved = modalData.previouslyApproved === true
  const onResolve =
    typeof modalData.onResolve === 'function'
      ? (modalData.onResolve as (decision: 'run' | 'skip') => void)
      : null

  const resolveAndClose = (decision: 'run' | 'skip') => {
    if (decision === 'run' && repoId) {
      if (alwaysTrust) {
        markAgentStartHookRepoAlwaysTrusted(repoId)
      } else if (contentHash) {
        markAgentStartHookScriptConfirmed(repoId, scriptKind, contentHash)
      }
    }
    onResolve?.(decision)
    closeModal()
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resolveAndClose('skip')
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-sm">
            {previouslyApproved
              ? translate(
                  'auto.components.sidebar.AgentStartYamlTrustDialog.02b0ede5ad',
                  "{{value0}}'s {{value1}} changed — run the new version?",
                  { value0: repoName, value1: SCRIPT_KIND_LABEL[scriptKind] }
                )
              : translate(
                  'auto.components.sidebar.AgentStartYamlTrustDialog.e4a51dc4b3',
                  'Run {{value0}} from {{value1}}?',
                  { value0: SCRIPT_KIND_LABEL[scriptKind], value1: repoName }
                )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {previouslyApproved ? (
              <>
                <code>
                  {translate(
                    'auto.components.sidebar.AgentStartYamlTrustDialog.79afc6772b',
                    'agentstart.yaml'
                  )}
                </code>{' '}
                {translate(
                  'auto.components.sidebar.AgentStartYamlTrustDialog.c55beddbf8',
                  'changed since you last approved. Re-review before it runs'
                )}{' '}
                {SCRIPT_KIND_TRIGGER[scriptKind]}.
              </>
            ) : (
              <>
                {translate(
                  'auto.components.sidebar.AgentStartYamlTrustDialog.aa3ffb33fb',
                  "This repository's"
                )}
                <code>
                  {translate(
                    'auto.components.sidebar.AgentStartYamlTrustDialog.79afc6772b',
                    'agentstart.yaml'
                  )}
                </code>{' '}
                {translate(
                  'auto.components.sidebar.AgentStartYamlTrustDialog.831f2cd9f0',
                  'runs on your machine'
                )}{' '}
                {SCRIPT_KIND_TRIGGER[scriptKind]}
                {translate(
                  'auto.components.sidebar.AgentStartYamlTrustDialog.bf800b7e04',
                  '. Only run if you trust'
                )}
                {repoName}.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {scriptContent && (
          <div className="border-border/70 bg-muted/35 border px-3 py-2">
            <div className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
              {previouslyApproved
                ? translate(
                    'auto.components.sidebar.AgentStartYamlTrustDialog.9e52effffd',
                    'New {{value0}} script',
                    { value0: scriptKind }
                  )
                : translate(
                    'auto.components.sidebar.AgentStartYamlTrustDialog.95bf974a1a',
                    '{{value0}} script',
                    { value0: scriptKind }
                  )}
            </div>
            <pre className="text-foreground scrollbar-sleek max-h-48 overflow-auto font-mono text-xs break-all whitespace-pre-wrap">
              {scriptContent}
            </pre>
          </div>
        )}

        <label
          className={cn(
            'flex cursor-pointer items-center gap-2.5 border px-3 py-2 transition-colors',
            alwaysTrust
              ? 'border-primary/60 bg-primary/5'
              : 'border-border/70 bg-muted/25 hover:border-border hover:bg-muted/40'
          )}
        >
          <Checkbox
            checked={alwaysTrust}
            onCheckedChange={(checked) => setAlwaysTrust(checked === true)}
          />
          <span className="text-foreground text-xs font-medium">
            {translate(
              'auto.components.sidebar.AgentStartYamlTrustDialog.531689199b',
              'Always trust'
            )}
            <code>
              {translate(
                'auto.components.sidebar.AgentStartYamlTrustDialog.79afc6772b',
                'agentstart.yaml'
              )}
            </code>{' '}
            {translate('auto.components.sidebar.AgentStartYamlTrustDialog.c494b3ccb1', 'in')}
            {repoName}
          </span>
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={() => resolveAndClose('skip')}>
            {translate('auto.components.sidebar.AgentStartYamlTrustDialog.43b7bec4cd', "Don't run")}
          </Button>
          <Button onClick={() => resolveAndClose('run')}>
            {translate('auto.components.sidebar.AgentStartYamlTrustDialog.f3e2b868fb', 'Run hooks')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default AgentStartYamlTrustDialog
