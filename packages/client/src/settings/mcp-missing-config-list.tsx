import { translate } from '~renderer/i18n/i18n'

import type { LoadedMcpConfigInspection } from './mcp-config-file-row'

export function McpMissingConfigList({
  missingConfigs
}: {
  missingConfigs: LoadedMcpConfigInspection[]
}): React.JSX.Element | null {
  if (missingConfigs.length === 0) {
    return null
  }

  return (
    <div className="border-border/50 space-y-1.5 border-t px-3 py-2">
      <p className="text-muted-foreground text-[11px]">
        {translate('auto.components.settings.McpConfigSection.4d16a0d9ac', 'Checked')}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {missingConfigs.map((config) => (
          <span
            key={config.candidate.relativePath}
            className="border-border/50 bg-background/40 text-muted-foreground rounded-md border px-1.5 py-0.5 font-mono text-[10px]"
          >
            {config.candidate.relativePath}
          </span>
        ))}
      </div>
    </div>
  )
}
