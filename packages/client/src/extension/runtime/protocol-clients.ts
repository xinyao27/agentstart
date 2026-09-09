import {
  AppControlClient,
  DiagnosticsClient,
  LocalDownloadClient,
  StatsClient,
  StatusClient,
  type RuntimeTransport
} from '@yiru/protocol'

export class ExtensionProtocolClients {
  appControl: AppControlClient | null = null
  diagnostics: DiagnosticsClient | null = null
  localDownload: LocalDownloadClient | null = null
  stats: StatsClient | null = null
  status: StatusClient | null = null
  private capabilities: ReadonlySet<string> | null = null

  connect(transport: RuntimeTransport): void {
    this.appControl = new AppControlClient(transport)
    this.diagnostics = new DiagnosticsClient(transport)
    this.localDownload = new LocalDownloadClient(transport)
    this.stats = new StatsClient(transport)
    this.status = new StatusClient(transport)
  }

  clear(): void {
    this.appControl = null
    this.capabilities = null
    this.diagnostics = null
    this.localDownload = null
    this.stats = null
    this.status = null
  }

  async supportsCapability(
    capability: string,
    deadline: number,
    remainingTimeout: (deadline: number) => number
  ): Promise<boolean> {
    if (!this.capabilities) {
      if (!this.status) {
        return false
      }
      const status = await this.status.get({ timeoutMs: remainingTimeout(deadline) })
      this.capabilities = new Set(status.capabilities)
    }
    return this.capabilities.has(capability)
  }
}
