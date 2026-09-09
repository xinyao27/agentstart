import type { ExtensionBrowserCapabilities } from '~renderer/extension/browser-capabilities'

export type NotificationPermissionStatusResult = Awaited<
  ReturnType<ExtensionBrowserCapabilities['getNotificationPermissionStatus']>
>
export type NotificationDeliveryProbeResult = Awaited<
  ReturnType<ExtensionBrowserCapabilities['probeNotificationDelivery']>
>
