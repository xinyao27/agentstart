import { mountExtensionInstall } from '@agentstart/client/extension-install'

import { mountExtensionSurface } from '../bootstrap'

const url = new URL(location.href)

if (url.searchParams.get('install') === '1') {
  mountExtensionInstall({
    onContinue: () => {
      url.searchParams.delete('install')
      url.searchParams.set('view', 'activity')
      location.replace(url.href)
    }
  })
} else {
  void mountExtensionSurface('workspace')
}
