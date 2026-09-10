import type { TerminalQuickCommand } from '@agentstart/protocol/terminal/quick-commands'

import { useProjectCatalog } from '../project-catalog/provider'
import { TerminalQuickCommandDialog } from '../terminal-quick-commands/terminal-quick-command-dialog'

type TerminalQuickCommandEditorProps = {
  command: TerminalQuickCommand
  onOpenChange: (open: boolean) => void
  onSave: (command: TerminalQuickCommand) => void
}

export function TerminalQuickCommandEditor({
  command,
  onOpenChange,
  onSave
}: TerminalQuickCommandEditorProps): React.JSX.Element {
  const { repos } = useProjectCatalog()
  return (
    <TerminalQuickCommandDialog
      open
      mode="add"
      command={command}
      repos={repos}
      onOpenChange={onOpenChange}
      onSave={onSave}
    />
  )
}
