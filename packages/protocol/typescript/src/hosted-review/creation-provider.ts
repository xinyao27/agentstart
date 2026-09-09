import type { HostedReviewProvider } from './types'

export type HostedReviewCreationProvider = 'github'

export function supportsHostedReviewCreation(
  provider: HostedReviewProvider | null | undefined
): provider is HostedReviewCreationProvider {
  return provider === 'github'
}

export function resolveHostedReviewCreationProvider(
  provider: HostedReviewProvider | null | undefined
): HostedReviewCreationProvider {
  return supportsHostedReviewCreation(provider) ? provider : 'github'
}
