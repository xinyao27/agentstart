import type { SourceControlActionId } from '@yiru/protocol/source-control/ai-actions'
import { translate } from '~renderer/i18n/i18n'
import { createLocalizedCatalog } from '~renderer/i18n/localized-catalog'

export const getSourceControlActionLabels = createLocalizedCatalog(
  (): Record<SourceControlActionId, string> => ({
    commitMessage: translate('sourceControl.aiAction.commitMessage', 'Commit message'),
    pullRequest: translate('sourceControl.aiAction.pullRequest', 'Pull request details'),
    branchName: translate('sourceControl.aiAction.branchName', 'Branch name'),
    fixCommitFailure: translate('sourceControl.aiAction.fixCommitFailure', 'Commit failure fixes'),
    fixPushFailure: translate('sourceControl.aiAction.fixPushFailure', 'Push failure fixes'),
    fixChecks: translate('sourceControl.aiAction.fixChecks', 'Broken checks fixes'),
    resolveConflicts: translate('sourceControl.aiAction.resolveConflicts', 'Conflict resolution'),
    resolveComments: translate(
      'sourceControl.aiAction.resolveComments',
      'Review comment resolution'
    )
  })
)

export type SourceControlActionVariableInfo = {
  description: string
  example: string
}

export const getSourceControlActionVariableInfo = createLocalizedCatalog(
  (): Record<string, SourceControlActionVariableInfo> => ({
    basePrompt: {
      description: translate(
        'sourceControl.aiVariable.6d7d7022f2',
        'Yiru’s built-in prompt for this action, including the context Yiru knows how to gather safely.'
      ),
      example: translate(
        'sourceControl.aiVariable.822bb26f9d',
        'Commit messages include staged diff guidance; PR details include branch comparison guidance; fix actions include the failure summary.'
      )
    },
    branch: {
      description: translate(
        'sourceControl.aiVariable.256be5185d',
        'The current source-control branch name.'
      ),
      example: translate('sourceControl.aiVariable.4b9b143d2d', 'feature/source-control-ai-recipes')
    },
    stagedFiles: {
      description: translate(
        'sourceControl.aiVariable.9d2decf0af',
        'A newline-separated list of staged files for commit-message generation.'
      ),
      example: translate(
        'sourceControl.aiVariable.b7dbb3d22a',
        'M src/shared/source-control-ai.ts\nA src/shared/source-control-ai-actions.ts'
      )
    },
    stagedPatch: {
      description: translate(
        'sourceControl.aiVariable.c70cd28bd1',
        'The staged git patch used for commit-message generation.'
      ),
      example: translate(
        'sourceControl.aiVariable.dbc856c6de',
        'diff --git a/src/app.ts b/src/app.ts\n+addActionRecipeDefaults()'
      )
    },
    baseBranch: {
      description: translate(
        'sourceControl.aiVariable.d42b275aaf',
        'The target branch selected in the Create PR composer.'
      ),
      example: translate('sourceControl.aiVariable.13fd9ba1a4', 'main')
    },
    currentTitle: {
      description: translate(
        'sourceControl.aiVariable.39ed17d49e',
        'The PR title currently typed in the composer before generation starts.'
      ),
      example: translate(
        'sourceControl.aiVariable.0be7f35deb',
        'Improve Source Control AI customization'
      )
    },
    currentBody: {
      description: translate(
        'sourceControl.aiVariable.47d11ea83c',
        'The PR description currently typed in the composer before generation starts.'
      ),
      example: translate(
        'sourceControl.aiVariable.83af417791',
        'Adds configurable agents and command templates for Source Control actions.'
      )
    },
    commitSummary: {
      description: translate(
        'sourceControl.aiVariable.771f48bf9e',
        'A newline-separated list of commits on the branch compared to the base.'
      ),
      example: translate(
        'sourceControl.aiVariable.83dde95e81',
        'a1b2c3d Add action recipe defaults\nd4e5f6a Render command templates'
      )
    },
    changedFiles: {
      description: translate(
        'sourceControl.aiVariable.34a57b6c1a',
        'A summary of files changed between the branch and the base branch.'
      ),
      example: translate(
        'sourceControl.aiVariable.3a9e28496c',
        'src/shared/source-control-ai-actions.ts | 24 +++++\nsrc/main/text-generation.ts | 8 +-'
      )
    },
    patch: {
      description: translate(
        'sourceControl.aiVariable.4a6e201401',
        'The branch diff against the base branch used for PR-details generation.'
      ),
      example: translate(
        'sourceControl.aiVariable.d72330a776',
        'diff --git a/src/app.ts b/src/app.ts\n+renderSourceControlActionCommandTemplate()'
      )
    },
    firstPrompt: {
      description: translate(
        'sourceControl.aiVariable.9573cb82d1',
        'The first user request that created the Yiru workspace.'
      ),
      example: translate('sourceControl.aiVariable.7ed02f2afb', 'Fix CI and commit the result')
    },
    assistantMessage: {
      description: translate(
        'sourceControl.aiVariable.cce3690a92',
        'The initial agent response, when Yiru has one available.'
      ),
      example: translate(
        'sourceControl.aiVariable.a83b20fcc9',
        'I will inspect the failing check, patch the issue, and run tests.'
      )
    }
  })
)
