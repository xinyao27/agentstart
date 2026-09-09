import { useMutation } from '@tanstack/react-query'
import { translate } from '~renderer/i18n/i18n'
import { ClockCounterClockwise, FloppyDisk } from '~renderer/icons/hugeicons'
import { requireArtifactClient } from '~renderer/runtime/artifact-target'
import { requireWorkspaceEventsAppendClient } from '~renderer/runtime/workspace-events-target'
import { Button } from '~renderer/ui/button'

import { getExtensionBrowserCapabilities } from '../browser-capabilities'
import { uploadBrowserArtifact } from './artifact-upload'

type PerformanceAuditProps = {
  projectId: string
  worktreeId: string
}

export function PerformanceAudit(props: PerformanceAuditProps): React.JSX.Element {
  const capabilities = getExtensionBrowserCapabilities()
  const audit = useMutation({
    mutationFn: async () => {
      if (!(await capabilities.hasBrowserControlAccess())) {
        throw new Error('browser_control_unavailable')
      }
      const capture = await capabilities.runPerformanceAudit()
      const artifactId = await uploadBrowserArtifact({
        blob: capture.data,
        fileName: `performance-${new Date().toISOString().replaceAll(':', '-')}.json`,
        projectId: props.projectId
      })
      await (
        await requireWorkspaceEventsAppendClient({ kind: 'local' })
      ).appendPerformance({
        artifactId,
        metricCount: Object.keys(capture.metrics).length,
        pageUrl: capture.pageUrl,
        projectId: props.projectId,
        worktreeId: props.worktreeId
      })
      return { artifactId, metrics: capture.metrics }
    }
  })
  const download = useMutation({
    mutationFn: async (id: string) => {
      const ticket = await (await requireArtifactClient()).downloadTicket(id)
      await capabilities.downloadArtifact({ id, ticket: ticket.ticket })
    }
  })
  return (
    <div className="border-sidebar-border ml-6 border-l px-2 py-1.5">
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={audit.isPending}
        onClick={() => audit.mutate()}
      >
        <ClockCounterClockwise />
        {audit.isPending
          ? translate('extension.performance.running', 'Reloading and tracing…')
          : translate('extension.performance.run', 'Run performance trace')}
      </Button>
      {audit.data ? (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {translate('extension.performance.saved', '{{count}} metrics saved', {
              count: Object.keys(audit.data.metrics).length
            })}
          </span>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={translate('extension.performance.download', 'Download performance report')}
            disabled={download.isPending}
            onClick={() => download.mutate(audit.data.artifactId)}
          >
            <FloppyDisk />
          </Button>
        </div>
      ) : null}
      {audit.isError || download.isError ? (
        <p className="text-destructive pt-1 text-xs">
          {translate('extension.performance.failed', 'The exact preview tab could not be traced.')}
        </p>
      ) : null}
    </div>
  )
}
