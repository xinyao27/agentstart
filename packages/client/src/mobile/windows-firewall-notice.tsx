import type { WindowsMobileFirewallStatus } from '@agentstart/protocol'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { WarningCircle as CircleAlert, ShieldCheck } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { shellClient } from '~renderer/runtime/shell-client'
import { cn } from '~renderer/ui/class-names'

import { Button } from '../ui/button'

type WindowsFirewallNoticeProps = {
  pairingReady: boolean
  address?: string
  className?: string
}

export function WindowsFirewallNotice({
  pairingReady,
  address,
  className
}: WindowsFirewallNoticeProps): React.JSX.Element | null {
  const [status, setStatus] = useState<WindowsMobileFirewallStatus | null>(null)
  const [repairing, setRepairing] = useState(false)
  const mountedRef = useMountedRef()
  const inspectIdRef = useRef(0)

  const inspect = useEventCallback(async (): Promise<WindowsMobileFirewallStatus | null> => {
    // Why: UAC elevation steals and returns window focus, so a focus-triggered
    // inspection can race the post-repair one; only the latest result may win.
    const inspectId = ++inspectIdRef.current
    if (!pairingReady) {
      setStatus(null)
      return null
    }
    try {
      const next = await shellClient.mobile.getWindowsFirewallStatus(
        address ? { address } : undefined
      )
      if (mountedRef.current && inspectIdRef.current === inspectId) {
        setStatus(next)
      }
      return next
    } catch {
      if (mountedRef.current && inspectIdRef.current === inspectId) {
        setStatus(null)
      }
      return null
    }
  })

  useEffect(() => {
    void inspect()
    window.addEventListener('focus', inspect)
    return () => window.removeEventListener('focus', inspect)
  }, [inspect])

  if (!status?.supported) {
    return null
  }
  const firewallStatus = status
  const networkIsPublic = firewallStatus.networkCategory === 'public'
  const blockingRuleDetected = firewallStatus.blockingRuleDetected
  // Why: a Private-profile allow rule cannot help on managed domain networks.
  if (!pairingReady || firewallStatus.networkCategory === 'domain') {
    return null
  }
  if (
    !networkIsPublic &&
    (!firewallStatus.privateFirewallEnabled ||
      (firewallStatus.ruleAllowed && !blockingRuleDetected))
  ) {
    return null
  }

  async function repair(): Promise<void> {
    setRepairing(true)
    try {
      const result = await shellClient.mobile.repairWindowsFirewall()
      if (!mountedRef.current) {
        return
      }
      if (result.ok) {
        // Why: elevation success only confirms the script ran; managed policy
        // can still leave an overriding Block rule in effect.
        const next = await inspect()
        if (!mountedRef.current) {
          return
        }
        if (
          next?.supported &&
          (!next.privateFirewallEnabled ||
            (next.ruleAllowed && !next.blockingRuleDetected && next.inspectionAvailable))
        ) {
          toast.success(
            translate(
              'auto.components.mobile.WindowsFirewallNotice.repair-success',
              'Windows Firewall now allows AgentStart Mobile on private networks'
            )
          )
          return
        }
        if (!next) {
          setStatus(firewallStatus)
        }
        toast.error(
          translate(
            'auto.components.mobile.WindowsFirewallNotice.repair-unverified',
            'Windows Firewall access could not be verified'
          )
        )
        return
      }
      if (result.reason !== 'cancelled') {
        toast.error(
          translate(
            'auto.components.mobile.WindowsFirewallNotice.repair-failed',
            'Could not update the Windows Firewall rules'
          )
        )
      }
    } catch {
      if (mountedRef.current) {
        toast.error(
          translate(
            'auto.components.mobile.WindowsFirewallNotice.repair-failed',
            'Could not update the Windows Firewall rules'
          )
        )
      }
    } finally {
      if (mountedRef.current) {
        setRepairing(false)
      }
    }
  }

  return (
    <div className={cn('rounded-lg border border-border bg-muted/40 p-3', className)}>
      <div className="flex items-start gap-2.5">
        <CircleAlert className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {networkIsPublic
                ? translate(
                    'auto.components.mobile.WindowsFirewallNotice.public-title',
                    'Windows marks this network as public'
                  )
                : blockingRuleDetected
                  ? translate(
                      'auto.components.mobile.WindowsFirewallNotice.blocked-title',
                      'Windows may be blocking AgentStart Mobile'
                    )
                  : translate(
                      'auto.components.mobile.WindowsFirewallNotice.missing-title',
                      'Allow phone connections through Windows Firewall'
                    )}
            </p>
            <p className="text-muted-foreground text-xs">
              {networkIsPublic
                ? translate(
                    'auto.components.mobile.WindowsFirewallNotice.public-description',
                    'Change this trusted Wi-Fi network to Private before allowing AgentStart Mobile connections.'
                  )
                : blockingRuleDetected
                  ? translate(
                      'auto.components.mobile.WindowsFirewallNotice.blocked-description',
                      'An existing inbound Block rule can override the pairing exception. Repair removes conflicting TCP rules for this AgentStart app, then allows port {{port}} on Private networks.',
                      { port: firewallStatus.port }
                    )
                  : translate(
                      'auto.components.mobile.WindowsFirewallNotice.missing-description',
                      'Windows may block the pairing host. Add a rule for this AgentStart app and TCP port {{port}} on Private networks.',
                      { port: firewallStatus.port }
                    )}
            </p>
          </div>
          {networkIsPublic ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void shellClient.mobile.openWindowsNetworkSettings()}
            >
              {translate(
                'auto.components.mobile.WindowsFirewallNotice.open-settings',
                'Open network settings'
              )}
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={() => void repair()} disabled={repairing}>
              {repairing ? <LoadingIndicator /> : <ShieldCheck aria-hidden="true" />}
              {repairing
                ? translate(
                    'auto.components.mobile.WindowsFirewallNotice.waiting',
                    'Waiting for Windows…'
                  )
                : blockingRuleDetected
                  ? translate(
                      'auto.components.mobile.WindowsFirewallNotice.repair',
                      'Repair firewall access'
                    )
                  : translate(
                      'auto.components.mobile.WindowsFirewallNotice.allow',
                      'Allow phone connections'
                    )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
