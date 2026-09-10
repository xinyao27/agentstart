import {
  resolveHostedReviewCreationProvider,
  type HostedReviewCreationProvider
} from '@agentstart/protocol/hosted-review/creation-provider'
import type { HostedReviewProvider } from '@agentstart/protocol/hosted-review/types'
import { translate } from '~renderer/i18n/i18n'

export type SupportedHostedReviewCopyProvider = HostedReviewCreationProvider

export type LocalizedHostedReviewCopy = {
  shortLabel: string
  reviewLabel: string
  titleLabel: string
  providerName: string
}

export function resolveSupportedHostedReviewCopyProvider(
  provider: HostedReviewProvider | null | undefined
): SupportedHostedReviewCopyProvider {
  return resolveHostedReviewCreationProvider(provider)
}

export function localizedHostedReviewCopy(
  _provider: SupportedHostedReviewCopyProvider
): LocalizedHostedReviewCopy {
  return {
    shortLabel: translate('auto.i18n.hostedReview.copy.f0a4b8c2d1', 'PR'),
    reviewLabel: translate('auto.i18n.hostedReview.copy.e9f3a7b1c0', 'pull request'),
    titleLabel: translate('auto.i18n.hostedReview.copy.d8e2f6a0b9', 'Pull Request'),
    providerName: translate('auto.i18n.hostedReview.copy.c7d1e5f9a8', 'GitHub')
  }
}
