import type { ExecuteRequest } from '../../generated/yiru/runtime/v1/browser_pb.js'
import { invocation, targetInput, type BrowserCommandInvocation } from './command-invocation.js'

type SessionCommand = Extract<
  ExecuteRequest['command'],
  {
    case:
      | 'tabList'
      | 'tabShow'
      | 'tabCurrent'
      | 'tabProfileShow'
      | 'tabSwitch'
      | 'tabCreate'
      | 'tabClose'
      | 'profileList'
      | 'profileCreate'
      | 'profileDelete'
      | 'tabSetProfile'
      | 'tabProfileClone'
  }
>

export function decodeSessionCommand(command: SessionCommand): BrowserCommandInvocation {
  switch (command.case) {
    case 'tabList':
    case 'tabShow':
    case 'tabCurrent':
    case 'tabProfileShow':
      return invocation(command.case, targetInput(command.value.target))
    case 'tabSwitch':
      return invocation(command.case, {
        focus: command.value.focus || undefined,
        index: command.value.index,
        ...targetInput(command.value.target)
      })
    case 'tabCreate':
      return invocation(command.case, {
        profileId: command.value.profileId,
        url: command.value.url,
        worktree: command.value.target?.worktree
      })
    case 'tabClose':
      return invocation(command.case, {
        index: command.value.index,
        ...targetInput(command.value.target)
      })
    case 'profileList':
      return invocation(command.case, undefined)
    case 'profileCreate':
      return invocation(command.case, { label: command.value.label, scope: command.value.scope })
    case 'profileDelete':
      return invocation(command.case, { profileId: command.value.profileId })
    case 'tabSetProfile':
    case 'tabProfileClone':
      return invocation(command.case, {
        profileId: command.value.profileId,
        ...targetInput(command.value.target)
      })
  }
}
