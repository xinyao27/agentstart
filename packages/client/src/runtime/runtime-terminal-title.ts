import type { TerminalTab } from '@agentstart/protocol/workspace/tabs'
import { resolveTerminalTabTitle } from '~renderer/tab-title-resolution'

export function resolveRuntimeTerminalTitle(
  tab: Pick<TerminalTab, 'customTitle' | 'quickCommandLabel' | 'generatedTitle' | 'title'>,
  generatedTitlesEnabled: boolean,
  liveTitle = tab.title
): string {
  return resolveTerminalTabTitle({ ...tab, title: liveTitle }, generatedTitlesEnabled, liveTitle)
}
