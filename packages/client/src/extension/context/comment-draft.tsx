import { useMutation } from '@tanstack/react-query'
import { translate } from '~renderer/i18n/i18n'
import { ChatCircle, CheckCircle } from '~renderer/icons/hugeicons'
import { openGitHubTarget } from '~renderer/runtime/github-target'
import { Button } from '~renderer/ui/button'

import { getExtensionBrowserCapabilities } from '../browser-capabilities'
import type { ForgePageIdentity } from './page-identity'

type CommentDraftProps = {
  identity: ForgePageIdentity
  projectId: string
}

export function CommentDraft({ identity, projectId }: CommentDraftProps): React.JSX.Element {
  const capabilities = getExtensionBrowserCapabilities()
  const draft = useMutation({
    mutationFn: async () => {
      const granted = await capabilities.requestGitHubPage()
      if (!granted) {
        throw new Error('github_page_permission_denied')
      }
      const pageContext = await capabilities.readGitHubContext()
      const client = await openGitHubTarget()
      if (!client) {
        throw new Error('GitHub protocol capability is unavailable')
      }
      const result = await client.createCommentDraft({
        kind: identity.kind,
        number: identity.number,
        pageContext,
        pageUrl: identity.url,
        projectId
      })
      await capabilities.fillGitHubComment(result.draft)
    }
  })

  return (
    <div className="border-sidebar-border ml-6 border-l px-2 py-1.5">
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={draft.isPending}
        onClick={() => draft.mutate()}
      >
        {draft.isSuccess ? <CheckCircle /> : <ChatCircle />}
        {draft.isPending
          ? translate('extension.githubDraft.drafting', 'Drafting…')
          : draft.isSuccess
            ? translate('extension.githubDraft.filled', 'Draft filled for review')
            : translate('extension.githubDraft.create', 'Draft GitHub comment')}
      </Button>
      <p className="text-muted-foreground pt-1 text-xs">
        {translate(
          'extension.githubDraft.safety',
          'Uses the local diff and session context. AgentStart never submits it.'
        )}
      </p>
      {draft.isError ? (
        <p className="text-destructive pt-1 text-xs">
          {translate(
            'extension.githubDraft.failed',
            'The draft could not be created or the comment box was not found.'
          )}
        </p>
      ) : null}
    </div>
  )
}
