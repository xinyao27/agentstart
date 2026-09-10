import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { translate } from '~renderer/i18n/i18n'
import {
  DANGEROUS_APPROVAL_STATUS_QUERY_KEY,
  readDangerousApprovalStatus
} from '~renderer/runtime/dangerous-approval-target'
import { Button } from '~renderer/ui/button'

import { enrollDangerousApproval, removeDangerousApproval } from '../security/passkey'

export function DangerousApprovalSettings(): React.JSX.Element {
  const queryClient = useQueryClient()
  const status = useQuery({
    queryKey: DANGEROUS_APPROVAL_STATUS_QUERY_KEY,
    queryFn: readDangerousApprovalStatus
  })
  const change = useMutation({
    mutationFn: async (action: 'enroll' | 'remove') =>
      action === 'enroll' ? enrollDangerousApproval() : removeDangerousApproval(),
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: DANGEROUS_APPROVAL_STATUS_QUERY_KEY })
  })
  return (
    <section className="border-border mt-5 border p-4">
      <h2 className="font-medium">
        {translate('extension.browserSettings.dangerousApproval', 'Dangerous operation approval')}
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">
        {translate(
          'extension.browserSettings.dangerousApprovalDescription',
          'Optionally require a passkey, Touch ID, Windows Hello, or security key before agent permission approvals.'
        )}
      </p>
      <Button
        type="button"
        size="sm"
        variant={status.data?.configured ? 'outline' : 'default'}
        className="mt-3"
        disabled={change.isPending || status.isPending}
        onClick={() => change.mutate(status.data?.configured ? 'remove' : 'enroll')}
      >
        {status.data?.configured
          ? translate('extension.browserSettings.removePasskey', 'Remove passkey requirement')
          : translate('extension.browserSettings.enrollPasskey', 'Set up passkey approval')}
      </Button>
      {change.isError ? (
        <p className="text-destructive mt-2 text-sm">
          {translate(
            'extension.browserSettings.passkeyFailed',
            'The passkey ceremony did not complete; no security setting was changed.'
          )}
        </p>
      ) : null}
    </section>
  )
}
