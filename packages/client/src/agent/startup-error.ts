import type { StartupCommandError } from '@agentstart/protocol/agent/shell-command'
import { translate } from '~renderer/i18n/i18n'

export function startupCommandErrorMessage(error: StartupCommandError): string {
  switch (error) {
    case 'unclosed-quote':
      return translate('agent.startup.unclosedQuote', 'CLI arguments contain an unclosed quote.')
  }
}
