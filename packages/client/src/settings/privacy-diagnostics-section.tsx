import type { DiagnosticsBundle, DiagnosticsStatus } from '@agentstart/protocol'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { FileText } from '~renderer/icons/hugeicons'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { shellClient } from '~renderer/runtime/shell-client'

import { Label } from '../ui/label'
import { Separator } from '../ui/separator'
import {
  getDiagnosticBundleDescription,
  PrivacyDiagnosticBundleControls
} from './privacy-diagnostic-bundle-controls'

export function PrivacyDiagnosticsSection(): React.JSX.Element {
  const [status, setStatus] = useState<DiagnosticsStatus | null>(null)
  const [bundle, setBundle] = useState<DiagnosticsBundle | null>(null)
  const [previewOpened, setPreviewOpened] = useState(false)
  const [ticketId, setTicketId] = useState<string | null>(null)
  const [collecting, setCollecting] = useState(false)
  const [openingPreview, setOpeningPreview] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [copyingTicket, setCopyingTicket] = useState(false)
  const mountedRef = useRef(true)
  const activeBundleSubmissionIdRef = useRef<string | null>(null)

  const refreshStatus = useEventCallback(async (): Promise<void> => {
    try {
      const next = await shellClient.diagnostics.getStatus()
      if (mountedRef.current) {
        setStatus(next)
      }
    } catch {
      /* swallow — pane shows N/A while the IPC is unavailable */
    }
  })

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (activeBundleSubmissionIdRef.current) {
        void shellClient.diagnostics.discardBundlePreview(activeBundleSubmissionIdRef.current)
      }
    }
  }, [])

  const handleCollectBundle = async (): Promise<void> => {
    setCollecting(true)
    try {
      const nextBundle = await shellClient.diagnostics.collectBundle()
      if (!mountedRef.current) {
        await shellClient.diagnostics.discardBundlePreview(nextBundle.bundleSubmissionId)
        return
      }
      // Why: unmount cleanup may run before a passive ref mirror would fire;
      // keep the retained preview id in sync at the creation/clear sites.
      activeBundleSubmissionIdRef.current = nextBundle.bundleSubmissionId
      setBundle(nextBundle)
      setPreviewOpened(false)
      setTicketId(null)
      toast.success(
        translate(
          'auto.components.settings.PrivacyDiagnosticsSection.a2b3505c77',
          'Review file created'
        )
      )
    } catch (error) {
      if (mountedRef.current) {
        toast.error(getDiagnosticsErrorMessage(error, 'Could not create review file'))
      }
    } finally {
      if (mountedRef.current) {
        setCollecting(false)
      }
    }
  }

  const handleOpenPreview = async (): Promise<void> => {
    if (!bundle) {
      return
    }
    setOpeningPreview(true)
    try {
      await shellClient.diagnostics.openBundlePreview(bundle.bundleSubmissionId)
      if (!mountedRef.current) {
        return
      }
      setPreviewOpened(true)
      toast.success(
        translate(
          'auto.components.settings.PrivacyDiagnosticsSection.db3228e01a',
          'Review file opened'
        )
      )
    } catch (error) {
      if (mountedRef.current) {
        toast.error(getDiagnosticsErrorMessage(error, 'Could not open review file'))
      }
    } finally {
      if (mountedRef.current) {
        setOpeningPreview(false)
      }
    }
  }

  const handleUploadBundle = async (): Promise<void> => {
    if (!bundle) {
      return
    }
    setUploading(true)
    try {
      const upload = await shellClient.diagnostics.uploadBundle(bundle.bundleSubmissionId)
      if (!mountedRef.current) {
        return
      }
      if ('canceled' in upload) {
        return
      }
      activeBundleSubmissionIdRef.current = null
      setBundle(null)
      setPreviewOpened(false)
      setTicketId(upload.ticketId)
      toast.success(
        translate(
          'auto.components.settings.PrivacyDiagnosticsSection.49fc6c80e8',
          'Diagnostics sent'
        )
      )
    } catch (error) {
      if (mountedRef.current) {
        toast.error(getDiagnosticsErrorMessage(error, 'Could not send diagnostics'))
      }
    } finally {
      if (mountedRef.current) {
        setUploading(false)
      }
    }
  }

  const handleDiscardBundle = async (): Promise<void> => {
    if (!bundle) {
      return
    }
    setDiscarding(true)
    try {
      await shellClient.diagnostics.discardBundlePreview(bundle.bundleSubmissionId)
      if (!mountedRef.current) {
        return
      }
      activeBundleSubmissionIdRef.current = null
      setBundle(null)
      setPreviewOpened(false)
      toast.success(
        translate(
          'auto.components.settings.PrivacyDiagnosticsSection.860bca9ec9',
          'Review file discarded'
        )
      )
    } catch (error) {
      if (mountedRef.current) {
        toast.error(getDiagnosticsErrorMessage(error, 'Could not discard review file'))
      }
    } finally {
      if (mountedRef.current) {
        setDiscarding(false)
      }
    }
  }

  const handleCopyTicket = async (): Promise<void> => {
    if (!ticketId) {
      return
    }
    setCopyingTicket(true)
    try {
      await shellClient.ui.writeClipboardText(ticketId)
      if (!mountedRef.current) {
        return
      }
      toast.success(
        translate(
          'auto.components.settings.PrivacyDiagnosticsSection.13eb2c65a1',
          'Reference ID copied'
        )
      )
    } catch {
      if (mountedRef.current) {
        toast.error(
          translate(
            'auto.components.settings.PrivacyDiagnosticsSection.7a4944595b',
            'Could not copy reference ID'
          )
        )
      }
    } finally {
      if (mountedRef.current) {
        setCopyingTicket(false)
      }
    }
  }

  return (
    <>
      {status?.disabledReason ? (
        <DiagnosticsDisabledStateNote reason={status.disabledReason} />
      ) : null}
      <Separator />
      <PrivacyDiagnosticsRow
        icon={<FileText className="size-4" />}
        title={translate(
          'auto.components.settings.PrivacyDiagnosticsSection.af2fc82cde',
          'Send app diagnostics to support'
        )}
        description={getDiagnosticBundleDescription({ bundle, previewOpened, ticketId })}
      >
        <PrivacyDiagnosticBundleControls
          status={status}
          bundle={bundle}
          previewOpened={previewOpened}
          ticketId={ticketId}
          collecting={collecting}
          openingPreview={openingPreview}
          uploading={uploading}
          discarding={discarding}
          copyingTicket={copyingTicket}
          onCollect={handleCollectBundle}
          onOpenPreview={handleOpenPreview}
          onUpload={handleUploadBundle}
          onDiscard={handleDiscardBundle}
          onCopyTicket={handleCopyTicket}
          onDismissTicket={() => setTicketId(null)}
        />
      </PrivacyDiagnosticsRow>
    </>
  )
}

function getDiagnosticsErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function DiagnosticsDisabledStateNote({
  reason
}: {
  reason: NonNullable<DiagnosticsStatus['disabledReason']>
}): React.JSX.Element {
  const message =
    reason === 'do_not_track'
      ? translate(
          'auto.components.settings.PrivacyDiagnosticsRows.5a7cbe069a',
          'DO_NOT_TRACK=1 is set — creating and sending diagnostic files is disabled.'
        )
      : reason === 'agentstart_telemetry_disabled'
        ? translate(
            'auto.components.settings.PrivacyDiagnosticsRows.63d03261d1',
            'AGENT_START_TELEMETRY_DISABLED=1 is set — creating and sending diagnostic files is disabled.'
          )
        : reason === 'agentstart_diagnostics_disabled'
          ? translate(
              'auto.components.settings.PrivacyDiagnosticsRows.d37e92a06b',
              'AGENT_START_DIAGNOSTICS_DISABLED=1 is set — app diagnostics are off.'
            )
          : reason === 'ci'
            ? translate(
                'auto.components.settings.PrivacyDiagnosticsRows.5ebb31e1fb',
                'Running in CI — diagnostics are off.'
              )
            : translate(
                'auto.components.settings.PrivacyDiagnosticsRows.e27c8d45bf',
                'Diagnostics are disabled by an environment variable.'
              )

  return (
    <div className="border-border/60 bg-card/30 text-muted-foreground rounded border border-dashed px-3 py-2 text-xs">
      {message}
    </div>
  )
}

function PrivacyDiagnosticsRow({
  icon,
  title,
  description,
  children
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <div className="text-muted-foreground mt-0.5">{icon}</div>
        <div className="min-w-0 space-y-0.5">
          <Label className="text-sm">{title}</Label>
          <p className="text-muted-foreground text-xs">{description}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  )
}
