import { translate } from '~renderer/i18n/i18n'
import { CaretDown as ChevronDown, ArrowClockwise as RefreshCw } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import type { PublicKnownRuntimeEnvironment } from '~renderer/runtime/environment-model'
import { cn } from '~renderer/ui/class-names'

import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import {
  getActiveServerModeDescription,
  getHostModelCapabilitySummary,
  getRuntimeCapabilitiesSummary,
  LOCAL_RUNTIME_VALUE,
  NO_RUNTIME_VALUE,
  type RuntimeHostDetails
} from './runtime-environment-status'

type RuntimeEnvironmentAdvancedProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  allowLocalRuntime: boolean
  activeValue: string
  environments: PublicKnownRuntimeEnvironment[]
  detailsByEnvironmentId: Record<string, RuntimeHostDetails>
  isBusy: boolean
  isLoading: boolean
  onSelect: (value: string | null) => void
  onRefresh: () => void
}

export function RuntimeEnvironmentAdvanced(
  props: RuntimeEnvironmentAdvancedProps
): React.JSX.Element {
  return (
    <div data-settings-section="default-runtime">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => props.onOpenChange(!props.open)}
        className="-ml-2 text-xs"
      >
        {translate('auto.components.settings.RuntimeEnvironmentsPane.advanced', 'Advanced')}
        <ChevronDown className={cn('size-4 transition-transform', props.open && 'rotate-180')} />
      </Button>
      <div
        className={cn(
          'grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out',
          props.open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
        aria-hidden={!props.open}
      >
        <div className="min-h-0">
          <div
            className={cn(
              'space-y-2 px-1 pt-3 pb-1 transition-[opacity,transform] duration-150 ease-out',
              props.open
                ? 'translate-y-0 opacity-100 delay-200'
                : '-translate-y-1 opacity-0 delay-0'
            )}
          >
            <div className="space-y-1">
              <Label id="runtime-active-server-label">
                {translate(
                  'auto.components.settings.RuntimeEnvironmentsPane.64b6bea541',
                  'Default runtime'
                )}
              </Label>
              <p className="text-muted-foreground text-xs">
                {getActiveServerModeDescription(props.allowLocalRuntime)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={props.activeValue}
                onValueChange={props.onSelect}
                disabled={props.isBusy}
              >
                <SelectTrigger
                  size="sm"
                  className="min-w-[260px]"
                  aria-labelledby="runtime-active-server-label"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {props.allowLocalRuntime ? (
                    <SelectItem value={LOCAL_RUNTIME_VALUE}>
                      {translate(
                        'auto.components.settings.RuntimeEnvironmentsPane.78692becbd',
                        'Local desktop'
                      )}
                    </SelectItem>
                  ) : props.environments.length === 0 ? (
                    <SelectItem value={NO_RUNTIME_VALUE} disabled>
                      {translate(
                        'auto.components.settings.RuntimeEnvironmentsPane.b07070ed3c',
                        'No remote daemon connected'
                      )}
                    </SelectItem>
                  ) : null}
                  {props.environments.map((environment) => (
                    <SelectItem
                      key={environment.id}
                      value={environment.id}
                      disabled={environment.pairingRequired}
                    >
                      {environment.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={translate(
                  'auto.components.settings.RuntimeEnvironmentsPane.6ce4664003',
                  'Refresh hosts'
                )}
                title={translate(
                  'auto.components.settings.RuntimeEnvironmentsPane.6ce4664003',
                  'Refresh hosts'
                )}
                onClick={props.onRefresh}
                disabled={props.isLoading || props.isBusy}
              >
                {props.isLoading ? <LoadingIndicator /> : <RefreshCw />}
              </Button>
            </div>
            {props.environments.length > 0 ? (
              <RuntimeEnvironmentDetails
                environments={props.environments}
                detailsByEnvironmentId={props.detailsByEnvironmentId}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function RuntimeEnvironmentDetails({
  environments,
  detailsByEnvironmentId
}: Pick<
  RuntimeEnvironmentAdvancedProps,
  'environments' | 'detailsByEnvironmentId'
>): React.JSX.Element {
  return (
    <div className="space-y-2 pt-2">
      <div className="text-xs font-medium">
        {translate(
          'auto.components.settings.RuntimeEnvironmentsPane.serverDetails',
          'Host details'
        )}
      </div>
      <div className="border-border/50 bg-card/30 space-y-1 rounded-md border p-2">
        {environments.map((environment) => {
          const details = detailsByEnvironmentId[environment.id]
          const modelSummary = getHostModelCapabilitySummary(details?.runtimeStatus)
          return (
            <div
              key={environment.id}
              className="text-muted-foreground grid gap-1 px-2 py-1.5 text-[11px] sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]"
            >
              <div className="text-foreground truncate font-medium">{environment.name}</div>
              <div className="min-w-0 space-y-0.5">
                <div className="truncate font-mono">
                  {environment.endpoints[0]?.endpoint ??
                    translate(
                      'auto.components.settings.RuntimeEnvironmentsPane.6ef71985da',
                      'No endpoint'
                    )}
                </div>
                {details?.runtimeStatus ? (
                  <div className="truncate">
                    {translate(
                      'auto.components.settings.RuntimeEnvironmentsPane.0ef838094a',
                      'Protocol {{value0}}',
                      {
                        value0:
                          details.runtimeStatus.runtimeProtocolVersion ??
                          details.runtimeStatus.protocolVersion ??
                          0
                      }
                    )}
                    {details.runtimeStatus.hostPlatform
                      ? ` · ${details.runtimeStatus.hostPlatform}`
                      : ''}
                    {' · '}
                    {getRuntimeCapabilitiesSummary(details.runtimeStatus)}
                  </div>
                ) : null}
                {modelSummary ? <div className="truncate">{modelSummary}</div> : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
