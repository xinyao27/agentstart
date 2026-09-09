import QRCodeBrowser from 'qrcode'
import { useEffect, useState } from 'react'

import type { MobilePageStage } from './page-stage'
import { getMobileReleaseLink } from './release-link'

async function renderQrDataUrl(text: string): Promise<string> {
  return QRCodeBrowser.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 232
  })
}

type InstallQrResult = { stage: MobilePageStage; dataUrl: string }

export function useMobileInstallQr(stage: MobilePageStage | null): string | null {
  const [result, setResult] = useState<InstallQrResult | null>(null)

  // Why: render install QRs lazily and tag the result with its stage so it cannot
  // appear after the user leaves the install flow.
  useEffect(() => {
    if (stage !== 'flow') {
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const dataUrl = await renderQrDataUrl(getMobileReleaseLink().url)
        if (!cancelled) {
          setResult({ stage, dataUrl })
        }
      } catch {
        // Why: leave `result` untouched — the derivation below already renders null
        // for this stage until a successful generation lands.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [stage])

  return result?.stage === stage ? result.dataUrl : null
}
