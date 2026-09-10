import { useEffect, useRef, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Plus } from '~renderer/icons/hugeicons'
import { getRepositoryHookScriptTextareaRows } from '~renderer/settings/script-textarea-rows'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Textarea } from '~renderer/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~renderer/ui/tooltip'

import { YamlScriptBlock } from './hook-policy-controls'
import { getEnvVars, type LocalHookField } from './hook-settings-model'

function EnvVarChips(): React.JSX.Element {
  const envVars = getEnvVars()

  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground text-[11px]">
        {translate(
          'auto.components.settings.RepositoryHooksSection.b2b06c7ce8',
          'Available environment variables (hover for details):'
        )}
      </p>
      <TooltipProvider>
        <div className="flex flex-wrap gap-1.5">
          {envVars.map(({ name, description }) => (
            <Tooltip key={name}>
              <TooltipTrigger
                render={
                  <code
                    tabIndex={0}
                    className="border-border/50 bg-muted/35 text-muted-foreground hover:bg-muted/60 hover:text-foreground cursor-help rounded-md border px-2 py-1 font-mono text-[11px] transition-colors outline-none"
                  >
                    {name}
                  </code>
                }
              />
              <TooltipContent side="top" sideOffset={6} className="max-w-80 text-left text-wrap">
                {description}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </div>
  )
}

type SaveStatus = 'idle' | 'saving' | 'saved'

function SaveIndicator({ status }: { status: SaveStatus }): React.JSX.Element | null {
  if (status === 'idle') {
    return null
  }
  const isSaving = status === 'saving'
  return (
    <span
      className="text-muted-foreground inline-flex items-center gap-1.5 text-[11px]"
      aria-live="polite"
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          isSaving ? 'animate-pulse bg-amber-500' : 'bg-emerald-500'
        )}
      />
      {isSaving
        ? translate('auto.components.settings.RepositoryHooksSection.81057d5f71', 'Saving...')
        : translate('auto.components.settings.RepositoryHooksSection.2b6356e744', 'Saved')}
    </span>
  )
}

type ScriptEditorProps = {
  field: LocalHookField
  value: string
  hasShared: boolean
  sharedScript: string | undefined
  onChange: (next: string) => void
  onCommit: () => void
  sectionId?: string
}

export function ScriptEditor({
  field,
  value,
  hasShared,
  sharedScript,
  onChange,
  onCommit,
  sectionId
}: ScriptEditorProps): React.JSX.Element {
  const [showLocal, setShowLocal] = useState(value.length > 0)
  // Why: these track *which value* the save indicator is currently reacting
  // to (activeSaveValue) and which value has reached the "Saved" sub-phase
  // (confirmedSaveValue) — saveStatus below is derived from comparing them,
  // rather than stored as its own imperative flag.
  const [activeSaveValue, setActiveSaveValue] = useState<string | null>(null)
  const [confirmedSaveValue, setConfirmedSaveValue] = useState<string | null>(null)
  const savedTimerRef = useRef<number | null>(null)

  const saveStatus: SaveStatus =
    activeSaveValue === null ? 'idle' : activeSaveValue === confirmedSaveValue ? 'saved' : 'saving'

  const handleChange = (nextValue: string): void => {
    onChange(nextValue)
    setActiveSaveValue(nextValue)
    setConfirmedSaveValue(null)
    if (savedTimerRef.current !== null) {
      window.clearTimeout(savedTimerRef.current)
    }
    // Why: persistence is synchronous from the editor's POV, but we briefly
    // show "Saving..." then "Saved" so the indicator carries the auto-save trust
    // signal a Save button would (without the click).
    savedTimerRef.current = window.setTimeout(() => {
      setConfirmedSaveValue(nextValue)
      savedTimerRef.current = window.setTimeout(() => {
        setActiveSaveValue(null)
        setConfirmedSaveValue(null)
        savedTimerRef.current = null
      }, 1500)
    }, 250)
  }

  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) {
        window.clearTimeout(savedTimerRef.current)
        savedTimerRef.current = null
      }
    }
  }, [])

  const showLocalEditor = showLocal || value.length > 0 || !hasShared
  const editorRows = getRepositoryHookScriptTextareaRows(value)

  return (
    <div
      className="border-border/50 bg-background/80 space-y-3 rounded-2xl border p-4"
      id={sectionId}
    >
      <div className="space-y-1">
        <h5 className="text-sm font-semibold">{field.label}</h5>
        <p className="text-muted-foreground text-xs">{field.description}</p>
      </div>

      <EnvVarChips />

      {hasShared ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
              {translate(
                'auto.components.settings.RepositoryHooksSection.39da2ae12f',
                'agentstart.yaml'
              )}
              <span className="font-normal text-emerald-700/80 dark:text-emerald-300/80">
                {translate(
                  'auto.components.settings.RepositoryHooksSection.f828e1de19',
                  '- shared with your team'
                )}
              </span>
            </span>
            <span className="text-muted-foreground text-[11px]">
              {translate('auto.components.settings.RepositoryHooksSection.b113344b6a', 'Edit')}
              <code className="bg-muted rounded px-1 py-0.5">
                {translate(
                  'auto.components.settings.RepositoryHooksSection.39da2ae12f',
                  'agentstart.yaml'
                )}
              </code>{' '}
              {translate(
                'auto.components.settings.RepositoryHooksSection.7e4427b4a2',
                'to change.'
              )}
            </span>
          </div>
          <YamlScriptBlock content={sharedScript ?? ''} />
        </div>
      ) : null}

      {showLocalEditor ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            {hasShared ? (
              <span className="border-border bg-muted/30 text-muted-foreground inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium">
                {translate('auto.components.settings.RepositoryHooksSection.2d03a514db', 'local')}
                <span className="font-normal">
                  {translate(
                    'auto.components.settings.RepositoryHooksSection.40a446ae16',
                    '- just for you, on this machine'
                  )}
                </span>
              </span>
            ) : (
              <span />
            )}
            <SaveIndicator status={saveStatus} />
          </div>
          <Textarea
            value={value}
            aria-label={field.label}
            onChange={(event) => handleChange(event.target.value)}
            onBlur={onCommit}
            placeholder={field.placeholder}
            spellCheck={false}
            rows={editorRows}
            className="border-input bg-muted/20 placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:bg-background w-full min-w-0 resize-y rounded-lg border px-3 py-2 font-mono text-[12px] leading-[1.55] transition-[color] outline-none placeholder:italic"
          />
          <p className="text-muted-foreground text-[11px]">
            {translate(
              'auto.components.settings.RepositoryHooksSection.8c2893fae0',
              'Runs as a single shell script. Saved on this machine.'
            )}
          </p>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowLocal(true)}
          className="gap-1.5"
        >
          <Plus className="size-3.5" />
          {translate(
            'auto.components.settings.RepositoryHooksSection.5d940bde5c',
            'Add local script'
          )}
        </Button>
      )}
    </div>
  )
}
