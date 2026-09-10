import { translate } from '~renderer/i18n/i18n'

import { RuntimeStatusSegment } from './runtime-segment'

export function AgentStartRuntimeStatusSegment(): React.JSX.Element | null {
  return <RuntimeStatusSegment />
}

export function AgentStartRuntimeStatusOnlyFooter(): React.JSX.Element {
  return (
    <footer
      aria-label={translate(
        'auto.components.status.bar.AgentStartRuntimeStatus.footer',
        'AgentStart Runtime status'
      )}
      className="border-border bg-background flex h-6 min-h-[24px] shrink-0 items-center justify-end border-t pr-3"
    >
      <AgentStartRuntimeStatusSegment />
    </footer>
  )
}
