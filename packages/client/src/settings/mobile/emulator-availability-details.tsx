import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  CheckCircle as CheckCircle2,
  WarningCircle as CircleAlert
} from '~renderer/icons/hugeicons'

type EmulatorAvailability = {
  platform: string
  simctl: { ok: boolean; message?: string }
  serveSim: { ok: boolean; message?: string }
  message: string
}

type MobileEmulatorAvailabilityDetailsProps = {
  availability: EmulatorAvailability | null
}

function ToolchainStatusIcon({ ok }: { ok: boolean }): React.JSX.Element {
  return ok ? (
    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-700 dark:text-green-300" />
  ) : (
    <CircleAlert className="text-muted-foreground mt-0.5 size-4 shrink-0" />
  )
}

function ToolchainStatusRow({
  ok,
  title,
  detail,
  actions
}: {
  ok: boolean
  title: string
  detail: React.ReactNode
  actions?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-3 py-2">
      <ToolchainStatusIcon ok={ok} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-foreground text-sm font-medium">{title}</div>
        <div className="flex min-w-0 items-center gap-3">
          <div className="text-muted-foreground min-w-0 flex-1 text-xs break-words">{detail}</div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap justify-end gap-1">{actions}</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function MobileEmulatorAvailabilityDetails({
  availability
}: MobileEmulatorAvailabilityDetailsProps): React.JSX.Element | null {
  if (!availability) {
    return null
  }
  const iosOk = Boolean(availability.simctl?.ok && availability.serveSim?.ok)

  return (
    <div className="mt-3">
      <div className="divide-border/40 border-border/50 divide-y border px-3">
        <ToolchainStatusRow
          ok={iosOk}
          title={translate(
            'auto.components.settings.MobileEmulatorSdkStatus.76eb88b88e',
            'iOS Simulator (Xcode)'
          )}
          detail={
            iosOk
              ? translate('auto.components.settings.MobileEmulatorSdkStatus.c6f3ea4f12', 'Ready')
              : availability.simctl?.message ||
                availability.serveSim?.message ||
                availability.message ||
                translate(
                  'auto.components.settings.MobileEmulatorSdkStatus.e4f14b50d7',
                  'Install Xcode and add an iOS Simulator runtime.'
                )
          }
        />
      </div>
    </div>
  )
}
