import { isPushHookFailure } from '@agentstart/protocol/git/push-hook-failure'
import { stripCredentialsFromMessage } from '@agentstart/protocol/git/remote-error'
import { translate } from '~renderer/i18n/i18n'

import { summarizePushFailure } from './prompts/push-failure'
import {
  truncateDetail,
  extractPublishFailureDetail,
  resolveSubmodulePushFailureMessage
} from './remote-error-details'

const SYNC_PUSH_STAGE_ERROR = Symbol('source-control-sync-push-stage-error')

export type RemoteOperationErrorOptions = {
  publish?: boolean
  isPush?: boolean
  isForcePush?: boolean
  isSync?: boolean
  isSyncPushStage?: boolean
  isFetch?: boolean
  isFastForward?: boolean
  isRebase?: boolean
}

export function markSyncPushStageError<T>(error: T): T {
  if (error instanceof Error) {
    Object.defineProperty(error, SYNC_PUSH_STAGE_ERROR, {
      configurable: true,
      value: true
    })
  }
  return error
}

export function isSyncPushStageError(error: unknown): boolean {
  return error instanceof Error && Reflect.get(error, SYNC_PUSH_STAGE_ERROR) === true
}

export function resolveRemoteOperationErrorMessage(
  error: unknown,
  options?: RemoteOperationErrorOptions
): string {
  if (!(error instanceof Error)) {
    return translate('sourceControl.remoteError.0d35514cc1', 'Remote operation failed')
  }

  if (/unmerged files|needs merge|you have not concluded your merge/i.test(error.message)) {
    if (options?.isRebase) {
      return translate(
        'sourceControl.remoteError.8f239805b1',
        'Rebase blocked — resolve existing conflicts first.'
      )
    }
    return options?.isSync
      ? translate(
          'sourceControl.remoteError.f7dbbf0efd',
          'Sync blocked — resolve existing merge conflicts first.'
        )
      : translate(
          'sourceControl.remoteError.8babebf1ec',
          'Pull blocked — resolve existing merge conflicts first.'
        )
  }

  if (/automatic merge failed|CONFLICT \(|fix conflicts/i.test(error.message)) {
    if (options?.isRebase) {
      return translate(
        'sourceControl.remoteError.ebae7922a4',
        'Rebase stopped with conflicts. Resolve them in Source Control, then continue the rebase.'
      )
    }
    return options?.isSync
      ? translate(
          'sourceControl.remoteError.4348e0fd51',
          'Sync stopped with merge conflicts. Resolve them in Source Control, then commit the merge.'
        )
      : translate(
          'sourceControl.remoteError.2f913cb2e9',
          'Pull stopped with merge conflicts. Resolve them in Source Control, then commit the merge.'
        )
  }

  if (options?.publish) {
    const submoduleMessage = resolveSubmodulePushFailureMessage(
      error.message,
      translate('sourceControl.remoteError.fe4e7d8ab1', 'Publish Branch')
    )
    if (submoduleMessage) {
      return submoduleMessage
    }
  }

  if (options?.isSync) {
    const submoduleMessage = resolveSubmodulePushFailureMessage(
      error.message,
      translate('sourceControl.remoteError.8d261a372f', 'Sync')
    )
    if (submoduleMessage) {
      return submoduleMessage
    }
  }

  if (options?.isForcePush) {
    const submoduleMessage = resolveSubmodulePushFailureMessage(
      error.message,
      translate('sourceControl.remoteError.163f86dca7', 'Force Push')
    )
    if (submoduleMessage) {
      return submoduleMessage
    }
  }

  if (options?.isPush) {
    const submoduleMessage = resolveSubmodulePushFailureMessage(
      error.message,
      translate('sourceControl.remoteError.731ce7ed80', 'Push')
    )
    if (submoduleMessage) {
      return submoduleMessage
    }
  }

  const isPushLikeOperation =
    options?.isPush || options?.isForcePush || options?.publish || options?.isSyncPushStage
  if (isPushLikeOperation && isPushHookFailure(error.message)) {
    const summary = summarizePushFailure(error.message)
    const operationLabel = options?.publish
      ? translate('sourceControl.remoteError.fe4e7d8ab1', 'Publish Branch')
      : options?.isSyncPushStage
        ? translate('sourceControl.remoteError.8d261a372f', 'Sync')
        : options?.isForcePush
          ? translate('sourceControl.remoteError.163f86dca7', 'Force Push')
          : translate('sourceControl.remoteError.731ce7ed80', 'Push')
    return translate(
      'sourceControl.remoteError.093c809289',
      '{{operationLabel}} blocked — {{summary}}',
      { operationLabel, summary: summary.charAt(0).toLowerCase() + summary.slice(1) }
    )
  }

  // Why: under sync, the inner push runs *after* a successful pull, so a
  // non-fast-forward at that point means the remote raced ahead between
  // fetch and push — not "user forgot to pull". Saying "Pull first" would
  // be wrong (sync just did). Branch isSync above the shared NFF path so
  // sync gets a sync-shaped message instead of inheriting the push wording.
  if (
    options?.isSync &&
    /non-fast-forward|fetch first|updates were rejected/i.test(error.message)
  ) {
    return translate(
      'sourceControl.remoteError.6eb566e6b4',
      'Sync failed — remote moved while syncing. Try again.'
    )
  }

  // Why: force-with-lease rejection means the remote moved since our last
  // snapshot; telling the user to pull would defeat the explicit force-push
  // path and can reintroduce commits they meant to replace.
  if (
    options?.isForcePush &&
    /non-fast-forward|fetch first|updates were rejected|stale info/i.test(error.message)
  ) {
    return translate(
      'sourceControl.remoteError.663b6106ed',
      'Force push rejected — remote changed since last fetch. Fetch first, then try again.'
    )
  }

  // Why: non-fast-forward/rejected detection is shared across publish and push so
  // both paths surface the same actionable toast regardless of operation type.
  if (/non-fast-forward|fetch first|updates were rejected/i.test(error.message)) {
    return translate(
      'sourceControl.remoteError.d4b7eed02a',
      'Push rejected — remote has changes. Pull first, then try again.'
    )
  }

  // Why: `git pull` / merge refuses to run when the working tree has changes
  // that would be overwritten; surface a single readable line instead of the
  // multi-line git stderr (which lists every affected path).
  if (
    /local changes.*would be overwritten|Please commit your changes or stash them/i.test(
      error.message
    )
  ) {
    if (options?.isRebase) {
      return translate(
        'sourceControl.remoteError.3ef10426d5',
        'Rebase blocked — commit or stash your local changes first.'
      )
    }
    if (options?.isFastForward) {
      return translate(
        'sourceControl.remoteError.bb25e7fb10',
        'Fast-forward blocked — commit or stash your local changes first.'
      )
    }
    return translate(
      'sourceControl.remoteError.f1edcd3dee',
      'Pull blocked — commit or stash your local changes first.'
    )
  }

  if (/Pull would overwrite local changes/i.test(error.message)) {
    if (options?.isRebase) {
      return translate(
        'sourceControl.remoteError.3ef10426d5',
        'Rebase blocked — commit or stash your local changes first.'
      )
    }
    if (options?.isFastForward) {
      return translate(
        'sourceControl.remoteError.bb25e7fb10',
        'Fast-forward blocked — commit or stash your local changes first.'
      )
    }
    return translate(
      'sourceControl.remoteError.f1edcd3dee',
      'Pull blocked — commit or stash your local changes first.'
    )
  }

  if (/Pull would overwrite untracked files/i.test(error.message)) {
    if (options?.isRebase) {
      return translate(
        'sourceControl.remoteError.21eb744112',
        'Rebase blocked — move, remove, or add untracked files first.'
      )
    }
    if (options?.isFastForward) {
      return translate(
        'sourceControl.remoteError.29e110795c',
        'Fast-forward blocked — move, remove, or add untracked files first.'
      )
    }
    return translate(
      'sourceControl.remoteError.2c8c58e957',
      'Pull blocked — move, remove, or add untracked files first.'
    )
  }

  if (options?.publish) {
    // Why: publish failures often bubble up as raw wrapped git/IPC payloads; this
    // keeps the toast human-readable while preserving the actionable fatal reason.
    const detail = extractPublishFailureDetail(error.message)
    if (detail) {
      return translate(
        'sourceControl.remoteError.f9e3db7147',
        'Publish Branch failed. {{detail}}. Check your remote access and try again.',
        { detail }
      )
    }

    return translate(
      'sourceControl.remoteError.8b4fdcfb8b',
      'Publish Branch failed. Check your remote access and try again.'
    )
  }

  if (options?.isSync) {
    // Why: the user invoked Sync — surface "Sync failed" rather than leaking
    // the inner-step name ("Push failed"). Detail extraction matches push so
    // auth / protected-branch reasons stay actionable.
    const detail = extractPublishFailureDetail(error.message)
    if (detail) {
      return translate(
        'sourceControl.remoteError.5b477cedc7',
        'Sync failed. {{detail}}. Check your remote access and try again.',
        { detail }
      )
    }
    return translate(
      'sourceControl.remoteError.a3c9c7f99a',
      'Sync failed. Check your connection and try again.'
    )
  }

  if (options?.isForcePush) {
    const detail = extractPublishFailureDetail(error.message)
    if (detail) {
      return translate(
        'sourceControl.remoteError.feda5e4961',
        'Force Push failed. {{detail}}. Check your remote access and try again.',
        { detail }
      )
    }
    return translate(
      'sourceControl.remoteError.20d774c610',
      'Force Push failed. Check your connection and try again.'
    )
  }

  if (options?.isPush) {
    // Why: surfacing fatal/remote lines from git is more actionable than a generic
    // connection message for auth errors, protected branches, etc.
    const detail = extractPublishFailureDetail(error.message)
    if (detail) {
      return translate(
        'sourceControl.remoteError.a7ba118668',
        'Push failed. {{detail}}. Check your remote access and try again.',
        { detail }
      )
    }
    return translate(
      'sourceControl.remoteError.b6d05529c1',
      'Push failed. Check your connection and try again.'
    )
  }

  if (options?.isFetch) {
    const detail =
      extractPublishFailureDetail(error.message) ??
      truncateDetail(stripCredentialsFromMessage(error.message))
    return translate('sourceControl.remoteError.248177993c', 'Fetch failed. {{detail}}', { detail })
  }

  if (options?.isFastForward) {
    const detail =
      extractPublishFailureDetail(error.message) ??
      truncateDetail(stripCredentialsFromMessage(error.message))
    return translate('sourceControl.remoteError.fd4f5e730f', 'Fast-forward failed. {{detail}}', {
      detail
    })
  }

  if (options?.isRebase) {
    const detail =
      extractPublishFailureDetail(error.message) ??
      truncateDetail(stripCredentialsFromMessage(error.message))
    return translate('sourceControl.remoteError.36aaa4c08b', 'Rebase failed. {{detail}}', {
      detail
    })
  }

  return error.message
}
