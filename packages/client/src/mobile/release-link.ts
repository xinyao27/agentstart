import { translate } from '~renderer/i18n/i18n'

import { AGENTSTART_IOS_TESTFLIGHT_URL } from './downloads'

export type MobileReleaseLink = { ctaLabel: string; url: string }

export function getMobileReleaseLink(): MobileReleaseLink {
  return {
    ctaLabel: translate(
      'auto.components.mobile.mobile.platform.copy.testflight.cta',
      'Open TestFlight'
    ),
    url: AGENTSTART_IOS_TESTFLIGHT_URL
  }
}
