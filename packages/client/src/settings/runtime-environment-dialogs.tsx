import { translate } from '~renderer/i18n/i18n'
import { Trash as Trash2 } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import type { PublicKnownRuntimeEnvironment } from '~renderer/runtime/environment-model'

import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'

type RuntimeEnvironmentDialogsProps = {
  pendingSwitchValue: string | null
  pendingRemove: PublicKnownRuntimeEnvironment | null
  switchingValue: string | null
  removingId: string | null
  switchError: string | null
  removeError: string | null
  removingActiveHost: boolean
  allowLocalRuntime: boolean
  getEnvironmentLabel: (value: string) => string
  onCancelSwitch: () => void
  onConfirmSwitch: (value: string) => void
  onCancelRemove: () => void
  onConfirmRemove: (environment: PublicKnownRuntimeEnvironment) => void
}

export function RuntimeEnvironmentDialogs(
  props: RuntimeEnvironmentDialogsProps
): React.JSX.Element {
  return (
    <>
      <Dialog
        open={props.pendingSwitchValue !== null}
        onOpenChange={(open) => {
          if (!open && props.switchingValue === null) {
            props.onCancelSwitch()
          }
        }}
      >
        <DialogContent className="max-w-sm sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-sm">
              {translate(
                'auto.components.settings.RuntimeEnvironmentsPane.d570c35a99',
                'Switch Host'
              )}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'auto.components.settings.RuntimeEnvironmentsPane.b2290ed203',
                'AgentStart will focus this host and load its projects. Existing terminals and browser tabs on other hosts stay alive.'
              )}
            </DialogDescription>
          </DialogHeader>
          {props.pendingSwitchValue ? (
            <div className="border-border/70 bg-muted/35 rounded-md border px-3 py-2 text-xs">
              <div className="text-muted-foreground">
                {translate(
                  'auto.components.settings.RuntimeEnvironmentsPane.05e0fc3ebf',
                  'Switch to'
                )}
              </div>
              <div className="mt-0.5 truncate font-medium">
                {props.getEnvironmentLabel(props.pendingSwitchValue)}
              </div>
            </div>
          ) : null}
          {props.switchError ? (
            <p className="text-destructive text-sm">{props.switchError}</p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={props.onCancelSwitch}
              disabled={props.switchingValue !== null}
            >
              {translate('auto.components.settings.RuntimeEnvironmentsPane.af53761f31', 'Cancel')}
            </Button>
            <Button
              onClick={() => {
                if (props.pendingSwitchValue) {
                  props.onConfirmSwitch(props.pendingSwitchValue)
                }
              }}
              disabled={props.switchingValue !== null}
            >
              {props.switchingValue !== null ? <LoadingIndicator /> : null}
              {translate('auto.components.settings.RuntimeEnvironmentsPane.d2e00809e4', 'Switch')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={props.pendingRemove !== null}
        onOpenChange={(open) => {
          if (!open && props.removingId === null) {
            props.onCancelRemove()
          }
        }}
      >
        <DialogContent className="max-w-sm sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-sm">
              {translate(
                'auto.components.settings.RuntimeEnvironmentsPane.bb90dd6487',
                'Remove Host'
              )}
            </DialogTitle>
            <DialogDescription>
              {getRemoveDescription(props.removingActiveHost, props.allowLocalRuntime)}
            </DialogDescription>
          </DialogHeader>
          {props.pendingRemove ? (
            <div className="border-border/70 bg-muted/35 rounded-md border px-3 py-2 text-xs">
              <div className="truncate font-medium">{props.pendingRemove.name}</div>
              <div className="text-muted-foreground mt-0.5 truncate font-mono">
                {props.pendingRemove.endpoints[0]?.endpoint ??
                  translate(
                    'auto.components.settings.RuntimeEnvironmentsPane.6ef71985da',
                    'No endpoint'
                  )}
              </div>
            </div>
          ) : null}
          {props.removeError ? (
            <p className="text-destructive text-sm">{props.removeError}</p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={props.onCancelRemove}
              disabled={props.removingId !== null}
            >
              {translate('auto.components.settings.RuntimeEnvironmentsPane.af53761f31', 'Cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (props.pendingRemove) {
                  props.onConfirmRemove(props.pendingRemove)
                }
              }}
              disabled={props.removingId !== null}
            >
              {props.removingId !== null ? <LoadingIndicator /> : <Trash2 />}
              {translate('auto.components.settings.RuntimeEnvironmentsPane.d25f0688b1', 'Remove')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function getRemoveDescription(removingActiveHost: boolean, allowLocalRuntime: boolean): string {
  if (!removingActiveHost) {
    return translate(
      'auto.components.settings.RuntimeEnvironmentsPane.ed3e3f069d',
      'This removes the saved host from AgentStart. It does not change the active host.'
    )
  }
  return allowLocalRuntime
    ? translate(
        'auto.components.settings.RuntimeEnvironmentsPane.9f7665a01b',
        'Removing the active host first switches AgentStart back to Local desktop. Existing host sessions are left alone.'
      )
    : translate(
        'auto.components.settings.RuntimeEnvironmentsPane.b2fda48c39',
        'Removing the active host disconnects this browser from that host. Existing host sessions are left alone.'
      )
}
