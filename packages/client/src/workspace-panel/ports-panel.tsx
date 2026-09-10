import { LocalWorkspacePortsPanel } from './local-workspace-ports-panel'

export default function PortsPanel({ isVisible }: { isVisible: boolean }): React.JSX.Element {
  return <LocalWorkspacePortsPanel isVisible={isVisible} />
}
