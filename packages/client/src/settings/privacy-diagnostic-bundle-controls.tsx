import type { DiagnosticsBundle, DiagnosticsStatus } from '@yiru/protocol/diagnostics-values'
import { translate } from '~renderer/i18n/i18n'
import {
  Check,
  Clipboard,
  Eye,
  FileText,
  CloudArrowUp as UploadCloud,
  X
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'

import { Button } from '../ui/button'

export function PrivacyDiagnosticBundleControls({
  status,
  bundle,
  previewOpened,
  ticketId,
  collecting,
  openingPreview,
  uploading,
  discarding,
  copyingTicket,
  onCollect,
  onOpenPreview,
  onUpload,
  onDiscard,
  onCopyTicket,
  onDismissTicket
}: {
  readonly status: DiagnosticsStatus | null
  readonly bundle: DiagnosticsBundle | null
  readonly previewOpened: boolean
  readonly ticketId: string | null
  readonly collecting: boolean
  readonly openingPreview: boolean
  readonly uploading: boolean
  readonly discarding: boolean
  readonly copyingTicket: boolean
  readonly onCollect: () => Promise<void>
  readonly onOpenPreview: () => Promise<void>
  readonly onUpload: () => Promise<void>
  readonly onDiscard: () => Promise<void>
  readonly onCopyTicket: () => Promise<void>
  readonly onDismissTicket: () => void
}): React.JSX.Element {
  if (ticketId) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          disabled={copyingTicket}
          onClick={() => void onCopyTicket()}
        >
          <ActionIcon busy={copyingTicket} icon={<Clipboard className="size-3.5" />} />
          {translate(
            'auto.components.settings.PrivacyDiagnosticBundleControls.2801d4ce22',
            'Copy reference ID'
          )}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDismissTicket}>
          <Check className="size-3.5" />
          {translate('auto.components.settings.PrivacyDiagnosticBundleControls.2ae9a6b63e', 'Done')}
        </Button>
      </>
    )
  }

  if (bundle) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          disabled={openingPreview}
          onClick={() => void onOpenPreview()}
        >
          <ActionIcon busy={openingPreview} icon={<Eye className="size-3.5" />} />
          {translate(
            'auto.components.settings.PrivacyDiagnosticBundleControls.798b6f0be5',
            'Open review file'
          )}
        </Button>
        <Button
          size="sm"
          title={
            previewOpened
              ? undefined
              : translate(
                  'auto.components.settings.PrivacyDiagnosticBundleControls.d8be621237',
                  'Open the review file first.'
                )
          }
          disabled={!previewOpened || uploading}
          onClick={() => void onUpload()}
        >
          <ActionIcon busy={uploading} icon={<UploadCloud className="size-3.5" />} />
          {translate(
            'auto.components.settings.PrivacyDiagnosticBundleControls.aca2c8a367',
            'Send to support'
          )}
        </Button>
        <Button variant="ghost" size="sm" disabled={discarding} onClick={() => void onDiscard()}>
          <ActionIcon busy={discarding} icon={<X className="size-3.5" />} />
          {translate(
            'auto.components.settings.PrivacyDiagnosticBundleControls.a5acaffdb6',
            'Discard'
          )}
        </Button>
      </>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!status?.bundleEnabled || collecting}
      onClick={() => void onCollect()}
    >
      <ActionIcon busy={collecting} icon={<FileText className="size-3.5" />} />
      {translate(
        'auto.components.settings.PrivacyDiagnosticBundleControls.dc8404a930',
        'Create diagnostic file'
      )}
    </Button>
  )
}

export function getDiagnosticBundleDescription({
  bundle,
  previewOpened,
  ticketId
}: {
  readonly bundle: DiagnosticsBundle | null
  readonly previewOpened: boolean
  readonly ticketId: string | null
}): string {
  if (ticketId) {
    return translate(
      'auto.components.settings.PrivacyDiagnosticBundleControls.61676df223',
      'Diagnostics sent. Share this reference ID with support: {{value0}}.',
      { value0: ticketId }
    )
  }
  if (bundle) {
    const size = formatBytes(bundle.bytes)
    if (previewOpened) {
      return translate(
        'auto.components.settings.PrivacyDiagnosticBundleControls.fd7b3891af',
        'You opened the local review file ({{value0}}). Sending shares a bounded redacted excerpt and metadata with support; the full file stays on this device.',
        { value0: size }
      )
    }
    return translate(
      'auto.components.settings.PrivacyDiagnosticBundleControls.62340d4439',
      'Your local review file is ready ({{value0}}). Open it to review the source data. Sending shares only a bounded redacted excerpt and metadata; the full file stays on this device.',
      { value0: size }
    )
  }
  return translate(
    'auto.components.settings.PrivacyDiagnosticBundleControls.19ec5e29b3',
    'Collects recent app activity and errors into a local redacted file. Sending uploads only a bounded excerpt and metadata to PostHog; the full file stays on this device.'
  )
}

function ActionIcon({ busy, icon }: { readonly busy: boolean; readonly icon: React.ReactNode }) {
  return busy ? <LoadingIndicator className="size-3.5" /> : icon
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
