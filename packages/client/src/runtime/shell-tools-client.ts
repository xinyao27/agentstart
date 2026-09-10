import {
  AccountsClient,
  DeveloperPermissionsClient,
  type DeveloperPermissionId,
  type DeveloperPermissionRequestResult,
  type DeveloperPermissionState,
  type WindowsMobileFirewallRepairResult,
  type WindowsMobileFirewallStatus
} from '@agentstart/protocol'
import { WorktreeLabelsClient } from '@agentstart/protocol/worktree-labels'
import type { PdfExportInput, PdfExportResult } from '~renderer/extension/pdf-export'
import type {
  LocalhostWorktreeLabelResult,
  LocalhostWorktreeLabelRoute
} from '~renderer/ports/loopback-url'

import { openConfiguredBrowserHostProtocol } from './browser-host-runtime'
import { openWindowsFirewallTarget } from './windows-firewall-target'

const WINDOWS_FIREWALL_STATUS_TIMEOUT_MS = 15_000
const WINDOWS_FIREWALL_REPAIR_TIMEOUT_MS = 310_000
// Why: reading a permission spawns the macOS helper app, and requesting one
// waits for System Settings to open, so both outlast an ordinary shell call.
const DEVELOPER_PERMISSIONS_TIMEOUT_MS = 30_000

export type ShellMiniMaxCredentialsApi = {
  getStatus: () => Promise<{ configured: boolean }>
  saveCookie: (cookie: string) => Promise<{ configured: boolean }>
  clearCookie: () => Promise<{ configured: boolean }>
}
export type ShellMobileApi = {
  getWindowsFirewallStatus: (args?: { address?: string }) => Promise<WindowsMobileFirewallStatus>
  repairWindowsFirewall: () => Promise<WindowsMobileFirewallRepairResult>
  openWindowsNetworkSettings: () => Promise<boolean>
}
export type ShellDeveloperPermissionsApi = {
  getStatus: () => Promise<DeveloperPermissionState[]>
  request: (args: { id: DeveloperPermissionId }) => Promise<DeveloperPermissionRequestResult>
}
export type ShellLocalhostWorktreeLabelsApi = {
  register: (args: LocalhostWorktreeLabelRoute) => Promise<LocalhostWorktreeLabelResult>
}
export type ShellExportApi = {
  htmlToPdf: (args: PdfExportInput) => Promise<PdfExportResult>
}

async function accountsClient(): Promise<AccountsClient> {
  return new AccountsClient(await openConfiguredBrowserHostProtocol())
}

async function developerPermissionsClient(): Promise<DeveloperPermissionsClient> {
  return new DeveloperPermissionsClient(await openConfiguredBrowserHostProtocol())
}

export const shellMiniMaxCredentialsApi: ShellMiniMaxCredentialsApi = {
  getStatus: async () => {
    return (await accountsClient()).getMiniMaxCredentials({ timeoutMs: 12_000 })
  },
  saveCookie: async (cookie) => {
    return (await accountsClient()).saveMiniMaxCookie(cookie, { timeoutMs: 12_000 })
  },
  clearCookie: async () => {
    return (await accountsClient()).clearMiniMaxCookie({ timeoutMs: 12_000 })
  }
}
export const shellMobileApi: ShellMobileApi = {
  getWindowsFirewallStatus: async (input) =>
    (await openWindowsFirewallTarget()).getStatus(input, {
      timeoutMs: WINDOWS_FIREWALL_STATUS_TIMEOUT_MS
    }),
  repairWindowsFirewall: async () =>
    (await openWindowsFirewallTarget()).repair({ timeoutMs: WINDOWS_FIREWALL_REPAIR_TIMEOUT_MS }),
  openWindowsNetworkSettings: async () =>
    (await openWindowsFirewallTarget()).openNetworkSettings({
      timeoutMs: WINDOWS_FIREWALL_STATUS_TIMEOUT_MS
    })
}
export const shellDeveloperPermissionsApi: ShellDeveloperPermissionsApi = {
  getStatus: async () =>
    (await developerPermissionsClient()).getStatus({
      timeoutMs: DEVELOPER_PERMISSIONS_TIMEOUT_MS
    }),
  request: async (input) =>
    (await developerPermissionsClient()).request(input.id, {
      timeoutMs: DEVELOPER_PERMISSIONS_TIMEOUT_MS
    })
}
export const shellLocalhostWorktreeLabelsApi: ShellLocalhostWorktreeLabelsApi = {
  register: async (input) =>
    new WorktreeLabelsClient(await openConfiguredBrowserHostProtocol()).register({
      ...input,
      worktreePath: input.worktreePath ?? undefined,
      repoId: input.repoId ?? undefined,
      worktreeId: input.worktreeId ?? undefined
    })
}
