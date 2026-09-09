import type { SparsePreset } from '@yiru/protocol/worktree/create-result'
import React, { useRef, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  Check,
  Pencil,
  CaretUpDown as ChevronsUpDown,
  Plus,
  ArrowCounterClockwise as RefreshCcw
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { parseSparsePresetDirectories } from '~renderer/sparse/preset-draft'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Popover, PopoverContent, PopoverTrigger } from '~renderer/ui/popover'

import { SparseCheckoutPresetDraftForm, type SparsePresetDraft } from './checkout-preset-draft-form'

type SparseCheckoutPresetSelectProps = {
  repoId: string
  presets: SparsePreset[]
  selectedPresetId: string | null
  onSelectPreset: (preset: SparsePreset | null) => void
  disabled?: boolean
}

export default function SparseCheckoutPresetSelect({
  repoId,
  presets,
  selectedPresetId,
  onSelectPreset,
  disabled = false
}: SparseCheckoutPresetSelectProps): React.JSX.Element {
  const fetchSparsePresets = useAppStore((s) => s.fetchSparsePresets)
  const saveSparsePreset = useAppStore((s) => s.saveSparsePreset)
  const presetsForRepo = useAppStore((s) => s.sparsePresetsByRepo[repoId])
  const presetsLoadStatus = useAppStore((s) => s.sparsePresetsLoadStatusByRepo[repoId] ?? 'idle')
  const presetsLoading = presetsLoadStatus === 'loading'
  const presetsLoadError = useAppStore((s) => s.sparsePresetsErrorByRepo[repoId] ?? null)

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<SparsePresetDraft | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const nameInputFocusFrameRef = useRef<number | null>(null)
  const mountedRef = useMountedRef()

  const visiblePresets = presetsForRepo ?? presets
  const presetsLoaded = presetsForRepo !== undefined
  const isLoadingPresets = !disabled && presetsLoading
  const hasPresetLoadError = !disabled && !presetsLoaded && !!presetsLoadError
  const selectedPreset = (() =>
    visiblePresets.find((preset) => preset.id === selectedPresetId) ?? null)()
  const parsedDirectories = draft ? parseSparsePresetDirectories(draft.directoriesText) : null
  const trimmedName = draft?.name.trim() ?? ''
  const nameCollision =
    draft && trimmedName
      ? (visiblePresets.find(
          (preset) =>
            preset.id !== draft.presetId && preset.name.toLowerCase() === trimmedName.toLowerCase()
        ) ?? null)
      : null
  const nameError =
    draft && trimmedName.length === 0
      ? 'Name is required.'
      : trimmedName.length > 80
        ? 'Name must be 80 characters or fewer.'
        : nameCollision
          ? `"${nameCollision.name}" already exists.`
          : null
  const canSave =
    draft !== null &&
    !submitting &&
    !disabled &&
    presetsLoaded &&
    !nameError &&
    parsedDirectories !== null &&
    !parsedDirectories.error

  const cancelNameInputFocusFrame = (): void => {
    if (nameInputFocusFrameRef.current === null) {
      return
    }
    cancelAnimationFrame(nameInputFocusFrameRef.current)
    nameInputFocusFrameRef.current = null
  }

  const setNameInputNode = (node: HTMLInputElement | null): void => {
    // Why: the queued draft focus is only valid while this input is mounted.
    if (!node) {
      cancelNameInputFocusFrame()
    }
    nameInputRef.current = node
  }

  const startDraft = (nextDraft: SparsePresetDraft): void => {
    if (disabled || !presetsLoaded) {
      return
    }
    setDraft(nextDraft)
    cancelNameInputFocusFrame()
    nameInputFocusFrameRef.current = requestAnimationFrame(() => {
      nameInputFocusFrameRef.current = null
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    })
  }

  const startNewPreset = (): void => {
    startDraft({ mode: 'new', name: '', directoriesText: '' })
  }

  const handleRetryLoadPresets = (): void => {
    if (disabled || presetsLoading) {
      return
    }
    setDraft(null)
    void fetchSparsePresets(repoId)
  }

  const startEditPreset = (preset: SparsePreset): void => {
    startDraft({
      mode: 'edit',
      presetId: preset.id,
      name: preset.name,
      directoriesText: preset.directories.join('\n')
    })
  }

  const handleSaveDraft = async (): Promise<void> => {
    if (!draft || !canSave || !parsedDirectories) {
      return
    }
    setSubmitting(true)
    try {
      const saved = await saveSparsePreset({
        repoId,
        id: draft.presetId,
        name: trimmedName,
        directories: parsedDirectories.directories
      })
      if (saved && mountedRef.current) {
        if (draft.mode === 'new' || selectedPresetId === saved.id) {
          onSelectPreset(saved)
        }
        setDraft(null)
        setOpen(false)
      }
    } finally {
      if (mountedRef.current) {
        setSubmitting(false)
      }
    }
  }

  const handleSelectOff = (): void => {
    if (disabled || !presetsLoaded) {
      return
    }
    onSelectPreset(null)
    setDraft(null)
    setOpen(false)
  }

  const handleSelectPreset = (preset: SparsePreset): void => {
    if (disabled || !presetsLoaded) {
      return
    }
    onSelectPreset(preset)
    setDraft(null)
    setOpen(false)
  }

  const triggerLabel = isLoadingPresets
    ? 'Loading presets...'
    : hasPresetLoadError
      ? 'Retry loading presets'
      : !presetsLoaded
        ? 'Load presets'
        : selectedPreset
          ? selectedPreset.name
          : 'Off'

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen && presetsLoading) {
          setOpen(false)
          setDraft(null)
          return
        }
        setOpen(nextOpen)
        if (!nextOpen) {
          setDraft(null)
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-busy={isLoadingPresets}
            disabled={disabled || isLoadingPresets}
            className="text-foreground h-9 w-full justify-between px-3 text-sm font-normal"
          >
            <span className="truncate">{triggerLabel}</span>
            {isLoadingPresets ? (
              <LoadingIndicator className="size-3.5 opacity-60" />
            ) : hasPresetLoadError || !presetsLoaded ? (
              <RefreshCcw className="size-3.5 opacity-60" />
            ) : (
              <ChevronsUpDown className="size-3.5 opacity-50" />
            )}
          </Button>
        }
      />
      <PopoverContent
        align="start"
        className="popover-scroll-content scrollbar-sleek max-h-[min(var(--radix-popover-content-available-height),24rem)] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] overflow-y-auto p-0"
        initialFocus={false}
      >
        {draft ? (
          <SparseCheckoutPresetDraftForm
            draft={draft}
            parsedDirectories={parsedDirectories}
            nameError={nameError}
            submitting={submitting}
            canSave={canSave}
            setNameInputNode={setNameInputNode}
            onDraftChange={setDraft}
            onCancel={() => setDraft(null)}
            onSave={() => void handleSaveDraft()}
          />
        ) : !presetsLoaded ? (
          <div className="p-1">
            {hasPresetLoadError ? (
              <div className="text-destructive px-2 py-1.5 text-[11px]">
                <span className="break-words">{presetsLoadError}</span>
              </div>
            ) : null}
            <Button
              variant="ghost"
              size="default"
              type="button"
              className="focus-visible:bg-accent focus-visible:text-accent-foreground flex w-full justify-start border-0 px-2 text-left text-xs font-normal whitespace-normal"
              onClick={handleRetryLoadPresets}
            >
              <RefreshCcw className="text-muted-foreground size-3.5" />
              <span className="truncate">
                {hasPresetLoadError
                  ? translate(
                      'auto.components.sparse.SparseCheckoutPresetSelect.a683a4bc8e',
                      'Retry loading presets'
                    )
                  : translate(
                      'auto.components.sparse.SparseCheckoutPresetSelect.16223dde6a',
                      'Load presets'
                    )}
              </span>
            </Button>
          </div>
        ) : (
          <div>
            <div className="py-1">
              <Button
                variant="ghost"
                size="default"
                type="button"
                className="focus-visible:bg-accent focus-visible:text-accent-foreground mx-1 flex w-[calc(100%-0.5rem)] justify-start border-0 px-2 text-left text-xs font-normal whitespace-normal"
                onClick={handleSelectOff}
              >
                <Check className={cn('size-4', selectedPreset ? 'opacity-0' : 'opacity-100')} />
                {translate('auto.components.sparse.SparseCheckoutPresetSelect.c7f9b3f0c1', 'Off')}
              </Button>
            </div>
            {visiblePresets.length > 0 ? (
              <>
                <div className="bg-border h-px" />
                <div className="space-y-0.5 py-1">
                  {visiblePresets.map((preset) => (
                    <div
                      key={preset.id}
                      className="hover:bg-accent hover:text-accent-foreground mx-1 flex items-center"
                    >
                      <Button
                        variant="ghost"
                        size="default"
                        type="button"
                        className="focus-visible:bg-accent flex min-w-0 flex-1 justify-start border-0 px-2 text-left text-xs font-normal whitespace-normal"
                        onClick={() => handleSelectPreset(preset)}
                      >
                        <Check
                          className={cn(
                            'size-4 shrink-0',
                            selectedPreset?.id === preset.id ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <span className="truncate">{preset.name}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="quiet"
                        size="icon-xs"
                        aria-label={translate(
                          'auto.components.sparse.SparseCheckoutPresetSelect.7c3275d307',
                          'Edit {{value0}}',
                          { value0: preset.name }
                        )}
                        className="hover:bg-background/35 mr-1 size-7 shrink-0"
                        onClick={() => startEditPreset(preset)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
            <div className="border-border border-t">
              <Button
                type="button"
                variant="ghost"
                onClick={startNewPreset}
                className="mx-1 my-1 h-8 w-[calc(100%-0.5rem)] justify-start px-2 text-xs font-normal"
              >
                <Plus className="text-muted-foreground size-3.5" />
                {translate(
                  'auto.components.sparse.SparseCheckoutPresetSelect.c4ac80151d',
                  'New preset'
                )}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
