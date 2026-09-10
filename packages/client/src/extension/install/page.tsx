import { translate } from '~renderer/i18n/i18n'
import { Bug, CheckCircle, Globe, TerminalWindow } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'

export type ExtensionInstallPageProps = {
  onContinue: () => void
}

const CAPABILITIES = [
  {
    icon: TerminalWindow,
    kind: 'browser-control'
  },
  {
    icon: Bug,
    kind: 'development-evidence'
  },
  {
    icon: Globe,
    kind: 'permission-timing'
  }
] as const

export function ExtensionInstallPage({ onContinue }: ExtensionInstallPageProps): React.JSX.Element {
  return (
    <main className="bg-background text-foreground h-dvh overflow-y-auto px-5 py-10 sm:px-8 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <header className="border-border border-b pb-6">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {translate('extension.install.eyebrow', 'AgentStart for Chrome')}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {translate('extension.install.title', 'Your browser workbench is ready.')}
          </h1>
          <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6">
            {translate(
              'extension.install.introduction',
              'AgentStart brings the complete coding workspace into Chrome and connects it to the daemon that owns your agents, terminals, files, and worktrees.'
            )}
          </p>
        </header>

        <section className="border-border grid border-b md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="border-border py-6 md:border-r md:pr-6">
            <h2 className="text-base font-semibold">
              {translate('extension.install.debuggerTitle', 'Why Chrome lists “debugger”')}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              {translate(
                'extension.install.debuggerDescription',
                'Chrome requires this permission at install time. It is the foundation for browser-use, CDP recording and replay, network simulation, Console sensors, and performance capture.'
              )}
            </p>
            <div className="mt-4 flex items-start gap-2 text-sm">
              <CheckCircle className="mt-0.5 size-4 shrink-0 text-green-600" />
              <p>
                {translate(
                  'extension.install.debuggerBoundary',
                  'AgentStart attaches only while an action or sensor needs it, then detaches when that work stops or fails.'
                )}
              </p>
            </div>
          </div>

          <div className="py-6 md:pl-6">
            <h2 className="text-base font-semibold">
              {translate('extension.install.capabilitiesTitle', 'What this unlocks')}
            </h2>
            <div className="mt-4 grid gap-4">
              {CAPABILITIES.map((capability) => (
                <div key={capability.kind} className="flex items-start gap-3">
                  <capability.icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                  <div>
                    <h3 className="text-sm font-medium">{capabilityTitle(capability.kind)}</h3>
                    <p className="text-muted-foreground mt-0.5 text-xs leading-5">
                      {capabilityDescription(capability.kind)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="flex flex-col items-start gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground max-w-xl text-xs leading-5">
            {translate(
              'extension.install.privacy',
              'Page context is treated as untrusted data and is sent only to the daemon and agent you explicitly choose. AgentStart has no advertising or developer-operated stateful backend. Anonymous product telemetry starts enabled on new installations and can be turned off in Privacy & Telemetry.'
            )}
          </p>
          <Button type="button" className="sm:self-end" onClick={onContinue}>
            {translate('extension.install.continue', 'Continue to AgentStart')}
          </Button>
        </footer>
      </div>
    </main>
  )
}

function capabilityTitle(kind: (typeof CAPABILITIES)[number]['kind']): string {
  switch (kind) {
    case 'browser-control':
      return translate('extension.install.browserControlTitle', 'Native browser control')
    case 'development-evidence':
      return translate('extension.install.developmentEvidenceTitle', 'Development evidence')
    case 'permission-timing':
      return translate(
        'extension.install.permissionTimingTitle',
        'Permissions at the moment of use'
      )
  }
}

function capabilityDescription(kind: (typeof CAPABILITIES)[number]['kind']): string {
  switch (kind) {
    case 'browser-control':
      return translate(
        'extension.install.browserControlDescription',
        'Operate the page you choose through the same Chrome DevTools Protocol as DevTools.'
      )
    case 'development-evidence':
      return translate(
        'extension.install.developmentEvidenceDescription',
        'Record and replay interactions, simulate network conditions, and inspect Console signals.'
      )
    case 'permission-timing':
      return translate(
        'extension.install.permissionTimingDescription',
        'Read page content, history, capture, and site origins only when you activate that feature.'
      )
  }
}
