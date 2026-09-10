import { translate } from '~renderer/i18n/i18n'

type RuntimeEnvironmentRepairProps = { environmentId: string }

export function RuntimeEnvironmentRepair({
  environmentId
}: RuntimeEnvironmentRepairProps): React.JSX.Element {
  return (
    <div className="text-muted-foreground mt-1 space-y-1 text-xs">
      <p>
        {translate(
          'runtimeEnvironment.repairExplanation',
          'This saved connection needs a new pairing offer. Its original pairing file is preserved.'
        )}
      </p>
      <p>
        {translate(
          'runtimeEnvironment.repairCommand',
          'Create a new offer on the remote daemon, then import it locally with this connection ID:'
        )}
      </p>
      <code className="block break-all">{environmentId}</code>
      <code className="block break-all">
        agentstart environment import --name NAME --offer OFFER --replace ID
      </code>
    </div>
  )
}
