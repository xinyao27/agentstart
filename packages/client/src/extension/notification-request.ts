export type NotificationDisplayInput = {
  source?: 'agent-task-complete' | 'terminal-bell' | 'test'
  notificationId?: string
  worktreeId?: string
  paneKey?: string
  title: string
  body: string
  useSystemSound: boolean
  suppressWhenFocused: boolean
  requireDisplayConfirmation?: boolean
}

export type NotificationDisplayResult = {
  delivered: boolean
  reason?: 'suppressed-focus' | 'not-supported' | 'not-displayed' | 'blocked-by-system'
}

export type NotificationDismissResult = { dismissed: number }
