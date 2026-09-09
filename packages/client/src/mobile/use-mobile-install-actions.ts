import type { MouseEvent } from 'react'
import { toast } from 'sonner'
import { openHttpLink } from '~renderer/editor/http-link-routing'
import { translate } from '~renderer/i18n/i18n'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { shellClient } from '~renderer/runtime/shell-client'

import { getMobileReleaseLink } from './release-link'

export function useMobileInstallActions(): {
  copyInstallUrl: () => Promise<void>
  openInstallUrl: (event: MouseEvent<HTMLButtonElement>) => void
} {
  const mountedRef = useMountedRef()

  const openInstallUrl = (event: MouseEvent<HTMLButtonElement>): void => {
    openHttpLink(getMobileReleaseLink().url, { event })
  }

  const copyInstallUrl = async (): Promise<void> => {
    try {
      await shellClient.ui.writeClipboardText(getMobileReleaseLink().url)
      if (mountedRef.current) {
        toast.success(
          translate('auto.components.mobile.MobilePage.fad833de8d', 'Install link copied')
        )
      }
    } catch (error) {
      console.error('writeClipboardText failed', error)
      if (mountedRef.current) {
        toast.error(
          translate('auto.components.mobile.MobilePage.baea63c445', 'Failed to copy link')
        )
      }
    }
  }

  return { copyInstallUrl, openInstallUrl }
}
