import type { RuntimePeer } from '@yiru/protocol'
import { registerShellHost } from '@yiru/protocol/shell-host'
import { installShellHostHandlers } from '~renderer/runtime/shell-host/handler'

export class ExtensionShellServicesChannel {
  private readonly peer: RuntimePeer
  private readonly unregister: () => void
  private isClosed = false

  constructor(peer: RuntimePeer) {
    this.peer = peer
    this.unregister = installShellHostHandlers(peer.handlers)
  }

  async connect(): Promise<boolean> {
    if (this.isClosed) {
      return false
    }
    const accepted = await registerShellHost(this.peer)
    return !this.isClosed && accepted
  }

  close(): void {
    if (this.isClosed) {
      return
    }
    this.isClosed = true
    this.unregister()
  }
}
