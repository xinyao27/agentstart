import { translate } from '~renderer/i18n/i18n'
import {
  WarningCircle as AlertCircle,
  CheckCircle as CheckCircle2
} from '~renderer/icons/hugeicons'
import type { McpConfigInspection } from '~renderer/mcp-config'
import { cn } from '~renderer/ui/class-names'

import { Button } from '../ui/button'

export type LoadedMcpConfigInspection = McpConfigInspection & {
  absolutePath: string
  readError?: string
}

type McpConfigFileRowProps = {
  config: LoadedMcpConfigInspection
  onOpen: (config: LoadedMcpConfigInspection) => void
}

function statusLabel(config: LoadedMcpConfigInspection): string {
  if (config.readError) {
    return 'Unreadable'
  }
  if (config.status === 'missing') {
    return 'Not found'
  }
  if (config.status === 'invalid') {
    return 'Invalid JSON'
  }
  if (config.servers.length === 0) {
    return 'No servers'
  }
  return `${config.servers.length} server${config.servers.length === 1 ? '' : 's'}`
}

function statusClassName(config: LoadedMcpConfigInspection): string {
  if (config.readError || config.status === 'invalid') {
    return 'border-destructive/30 bg-destructive/10 text-destructive'
  }
  if (config.status === 'valid' && config.servers.length > 0) {
    return 'border-border/60 bg-background text-foreground'
  }
  return 'border-border/60 bg-muted/60 text-muted-foreground'
}

function serverDetailLabel(server: LoadedMcpConfigInspection['servers'][number]): string {
  if (server.transport === 'http') {
    return server.url ?? 'HTTP server'
  }
  if (server.transport === 'stdio') {
    return server.command ?? 'stdio server'
  }
  return server.issue ?? 'Invalid server'
}

export function McpConfigFileRow({ config, onOpen }: McpConfigFileRowProps): React.JSX.Element {
  return (
    <div className="space-y-2 px-3 py-2.5">
      <div className="flex items-center gap-2">
        {config.status === 'valid' && !config.readError ? (
          <CheckCircle2 className="text-muted-foreground size-3.5 shrink-0" />
        ) : (
          <AlertCircle className="text-destructive size-3.5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-medium">{config.candidate.label}</p>
            <p className="text-muted-foreground truncate font-mono text-[11px]">
              {config.candidate.relativePath}
            </p>
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
            statusClassName(config)
          )}
        >
          {statusLabel(config)}
        </span>
        {config.exists ? (
          <Button variant="outline" size="xs" onClick={() => onOpen(config)}>
            {translate('auto.components.settings.McpConfigFileRow.e720c139cd', 'Open')}
          </Button>
        ) : null}
      </div>

      {config.error || config.readError ? (
        <p className="text-destructive pl-5 text-xs">{config.readError ?? config.error}</p>
      ) : null}

      {config.servers.length > 0 ? (
        <div className="grid gap-1.5 pl-5">
          {config.servers.map((server) => (
            <div
              key={server.name}
              className="border-border/40 bg-background/50 grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md border px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-medium">{server.name}</span>
                  <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[9px] font-medium tracking-wider uppercase">
                    {server.transport}
                  </span>
                </div>
                <p className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]">
                  {serverDetailLabel(server)}
                </p>
                {server.env && Object.keys(server.env).length > 0 ? (
                  <p className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]">
                    {translate('auto.components.settings.McpConfigFileRow.b145eb6009', 'env:')}{' '}
                    {Object.entries(server.env)
                      .map(([key, value]) => `${key}=${value}`)
                      .join(', ')}
                  </p>
                ) : null}
              </div>
              <span className="text-muted-foreground self-start text-[11px]">{server.status}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
