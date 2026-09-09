import { useMutation } from '@tanstack/react-query'
import { translate } from '~renderer/i18n/i18n'
import { Crosshair } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'

import { openBrowserWritebackTarget } from '../../runtime/browser-writeback-target'
import { getExtensionBrowserCapabilities } from '../browser-capabilities'
import { getExtensionHostNavigation } from '../navigation'

type ElementPickerProps = {
  projectId: string
  worktreeId: string
}

export function ElementPicker(props: ElementPickerProps): React.JSX.Element {
  const capabilities = getExtensionBrowserCapabilities()
  const navigation = getExtensionHostNavigation()
  const picker = useMutation({
    mutationFn: async () => {
      await capabilities.prepareLongRunningAgent()
      const element = await capabilities.pickPageElement()
      if (!element) {
        return null
      }
      const client = await openBrowserWritebackTarget()
      if (!client) {
        throw new Error('browser_writeback_protocol_unavailable')
      }
      const result = await client.locateElement({
        evidence: {
          ...(element.column === null ? {} : { column: element.column }),
          ...(element.componentName === null ? {} : { componentName: element.componentName }),
          ...(element.sourceFile === null ? {} : { fileName: element.sourceFile }),
          ...(element.line === null ? {} : { line: element.line })
        },
        outerHtml: element.outerHtml,
        pageUrl: element.pageUrl,
        selector: element.selector,
        styles: element.computedStyles,
        target: { projectId: props.projectId, worktreeId: props.worktreeId }
      })
      return result.terminalHandle
    },
    onSuccess: (terminalHandle) => {
      if (terminalHandle) {
        navigation.openWorkspace({
          projectId: props.projectId,
          sessionId: terminalHandle,
          worktreeId: props.worktreeId
        })
      }
    }
  })

  return (
    <div className="border-sidebar-border ml-6 border-l px-2 py-1.5">
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={picker.isPending}
        onClick={() => picker.mutate()}
      >
        <Crosshair />
        {picker.isPending
          ? translate('extension.elementPicker.waiting', 'Pick an element…')
          : translate('extension.elementPicker.start', 'Pick element and ask agent')}
      </Button>
      {picker.isError ? (
        <p className="text-destructive pt-1 text-xs">
          {translate(
            'extension.elementPicker.failed',
            'The element could not be sent to an agent.'
          )}
        </p>
      ) : null}
    </div>
  )
}
