import { StarNagClient, StarNagPromptMode } from '@yiru/protocol/star-nag'
import { translate } from '~renderer/i18n/i18n'

import { openConfiguredBrowserHostProtocol } from '../browser-host-runtime'
import { subscribeShellEvent } from '../shell-events-client'
export type ShellStarNagApi = {
  onShow: (
    callback: (payload?: { mode?: 'gh' | 'web'; surface?: 'card' | 'toast' }) => void
  ) => () => void
  onHide: (callback: () => void) => () => void
  dismiss: () => Promise<void>
  later: () => Promise<void>
  complete: () => Promise<void>
  openWeb: () => Promise<void>
  starYiru: () => Promise<boolean>
  agentValueMoment: () => Promise<{ status: 'ready'; mode: 'gh' | 'web' } | { status: 'skipped' }>
  showAgentValueMoment: () => Promise<void>
  onboardingCompleted: () => Promise<void>
}
export const shellStarNagApi: ShellStarNagApi = {
  onShow: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'starNagShow') {
        callback({ mode: event.mode, surface: event.surface })
      }
    }),
  onHide: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'starNagHide') {
        callback()
      }
    }),
  dismiss: async () => {
    await (await starNagClient()).dismiss()
  },
  later: async () => {
    await (await starNagClient()).later()
  },
  complete: async () => {
    await (await starNagClient()).complete()
  },
  openWeb: async () => {
    await (await starNagClient()).openWeb()
  },
  starYiru: async () => (await (await starNagClient()).starYiru()).starred,
  agentValueMoment: async () => {
    const { mode } = await (await starNagClient()).agentValueMoment()
    if (mode === undefined) {
      return { status: 'skipped' }
    }
    if (mode === StarNagPromptMode.GH) {
      return { status: 'ready', mode: 'gh' }
    }
    if (mode === StarNagPromptMode.WEB) {
      return { status: 'ready', mode: 'web' }
    }
    throw new Error(translate('runtime.invalid.star.prompt.mode', 'Invalid star prompt mode'))
  },
  showAgentValueMoment: async () => {
    await (await starNagClient()).showAgentValueMoment()
  },
  onboardingCompleted: async () => {
    await (await starNagClient()).onboardingCompleted()
  }
}

async function starNagClient(): Promise<StarNagClient> {
  return new StarNagClient(await openConfiguredBrowserHostProtocol())
}
