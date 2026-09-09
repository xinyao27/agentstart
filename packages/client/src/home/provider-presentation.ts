import type { UsageProvider } from '@yiru/protocol/stats/usage-breakdown'
import { translate } from '~renderer/i18n/i18n'

export function providerLabel(provider: UsageProvider): string {
  switch (provider) {
    case 'claude':
      return translate('auto.components.home.provider.claude', 'Claude')
    case 'codex':
      return translate('auto.components.home.provider.codex', 'Codex')
    case 'open-code':
      return translate('auto.components.home.provider.openCode', 'OpenCode')
  }
}

export function providerClassName(provider: UsageProvider): string {
  switch (provider) {
    case 'claude':
      return 'bg-foreground'
    case 'codex':
      return 'bg-muted-foreground'
    case 'open-code':
      return 'bg-border'
  }
}
