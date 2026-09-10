import type { HookCommandSourcePolicy } from '@agentstart/protocol/worktree/hooks'
import type { AgentStartHooks } from '@agentstart/protocol/worktree/hooks'
import { translate } from '~renderer/i18n/i18n'
import { Warning as AlertTriangle, CaretRight as ChevronRight } from '~renderer/icons/hugeicons'
import { cn } from '~renderer/ui/class-names'

import { SearchableSetting } from '../searchable-setting'
import { ExampleTemplateCard, PolicyOptionGrid, YamlScriptBlock } from './hook-policy-controls'
import { getCommandSourceLabel, type PolicyOption, YAML_STATE_STYLES } from './hook-settings-model'

export function RepositoryHooksAdvancedSection({
  forceVisible,
  advancedMatchesSearch,
  isAdvancedOpen,
  onAdvancedOpenChange,
  selectedCommandSourcePolicy,
  commandSourcePolicyOptions,
  onSelectPolicy,
  yamlState,
  yamlStateCopy,
  yamlHooks,
  parseErrorFixes,
  copiedTemplate,
  onCopyTemplate
}: {
  forceVisible: boolean
  advancedMatchesSearch: boolean
  isAdvancedOpen: boolean
  onAdvancedOpenChange: (open: boolean) => void
  selectedCommandSourcePolicy: HookCommandSourcePolicy
  commandSourcePolicyOptions: PolicyOption<HookCommandSourcePolicy>[]
  onSelectPolicy: (policy: HookCommandSourcePolicy) => void
  yamlState: string
  yamlStateCopy: { heading: string; description: string }
  yamlHooks: AgentStartHooks | null
  parseErrorFixes: readonly string[]
  copiedTemplate: boolean
  onCopyTemplate: () => void
}): React.JSX.Element {
  return (
    <SearchableSetting
      title={translate('auto.components.settings.RepositoryHooksSection.c9bc1bfd8f', 'Advanced')}
      description={translate(
        'auto.components.settings.RepositoryHooksSection.610d90fdbd',
        'Command source and agentstart.yaml details.'
      )}
      forceVisible={forceVisible}
      keywords={[
        'advanced',
        'command source',
        'agentstart.yaml',
        'shared',
        'local',
        'both',
        'authoritative'
      ]}
    >
      <details
        className="group border-border/50 bg-background/80 rounded-2xl border"
        open={advancedMatchesSearch || isAdvancedOpen}
        onToggle={(event) => {
          if (advancedMatchesSearch) {
            return
          }
          onAdvancedOpenChange(event.currentTarget.open)
        }}
      >
        <summary
          className="focus-visible:bg-accent flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 outline-none [&::-webkit-details-marker]:hidden"
          onClick={(event) => {
            if (advancedMatchesSearch) {
              event.preventDefault()
            }
          }}
        >
          <div className="flex items-center gap-2">
            <ChevronRight className="text-muted-foreground size-3.5 transition-transform group-open:rotate-90" />
            <h5 className="text-sm font-semibold">
              {translate('auto.components.settings.RepositoryHooksSection.c9bc1bfd8f', 'Advanced')}
            </h5>
            <span className="text-muted-foreground text-xs">
              {translate(
                'auto.components.settings.RepositoryHooksSection.bbbd6e0bc4',
                'Command source & agentstart.yaml'
              )}
            </span>
          </div>
          <span className="border-border bg-muted text-foreground rounded-full border px-2 py-0.5 text-[11px] font-medium">
            {getCommandSourceLabel(selectedCommandSourcePolicy)}
          </span>
        </summary>

        <div className="border-border/50 space-y-5 border-t px-4 py-4">
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {translate(
                  'auto.components.settings.RepositoryHooksSection.32fec28f5b',
                  'Command Source'
                )}
              </p>
              <p className="text-muted-foreground text-[11px]">
                {translate(
                  'auto.components.settings.RepositoryHooksSection.ac9038d2cc',
                  'When both'
                )}
                <code className="bg-muted rounded px-1 py-0.5">
                  {translate(
                    'auto.components.settings.RepositoryHooksSection.39da2ae12f',
                    'agentstart.yaml'
                  )}
                </code>{' '}
                {translate(
                  'auto.components.settings.RepositoryHooksSection.3397879bee',
                  'and local commands exist, choose which run.'
                )}
              </p>
            </div>
            <PolicyOptionGrid
              options={commandSourcePolicyOptions}
              selected={selectedCommandSourcePolicy}
              onSelect={onSelectPolicy}
              columns="md:grid-cols-3"
            />
          </div>

          <div className={cn('space-y-3 rounded-xl border p-3', YAML_STATE_STYLES[yamlState].card)}>
            <div className="space-y-1">
              <p className={cn('text-sm font-medium', YAML_STATE_STYLES[yamlState].titleClassName)}>
                {yamlStateCopy.heading}
              </p>
              <p className="text-muted-foreground text-xs">{yamlStateCopy.description}</p>
            </div>

            {yamlState === 'loaded' ? (
              <YamlScriptBlock content={renderYamlScriptPreview(yamlHooks)} />
            ) : yamlState === 'invalid' ? (
              <div className="space-y-4">
                <div className="bg-background/60 flex items-start gap-3 rounded-lg border border-amber-500/20 p-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" />
                  <div className="text-muted-foreground space-y-2 text-xs">
                    <p>
                      {translate(
                        'auto.components.settings.RepositoryHooksSection.af49e2a19e',
                        'The file is present, but AgentStart could not find valid `scripts` definitions.'
                      )}
                    </p>
                    <ol className="space-y-1.5 pl-4 text-[11.5px]">
                      {parseErrorFixes.map((fix) => (
                        <li key={fix} className="list-decimal leading-5">
                          {fix}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
                <ExampleTemplateCard
                  copiedTemplate={copiedTemplate}
                  onCopyTemplate={onCopyTemplate}
                />
              </div>
            ) : (
              <ExampleTemplateCard
                copiedTemplate={copiedTemplate}
                onCopyTemplate={onCopyTemplate}
              />
            )}
          </div>
        </div>
      </details>
    </SearchableSetting>
  )
}

function renderYamlScriptPreview(hooks: AgentStartHooks | null): string {
  const format = (key: string, command?: string): string =>
    command ? `\n  ${key}: |\n${command.replace(/^/gm, '    ')}` : ''
  return `scripts:${format('setup', hooks?.scripts.setup)}${format('archive', hooks?.scripts.archive)}`
}
