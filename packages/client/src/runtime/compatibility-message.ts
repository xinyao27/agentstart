import type { RuntimeCompatVerdict } from '@yiru/protocol/runtime-compatibility'
import { translate } from '~renderer/i18n/i18n'

export function describeRuntimeCompatBlock(verdict: RuntimeCompatVerdict): string {
  if (verdict.kind === 'ok') {
    return translate('runtime.compatibility.compatible', 'Runtime client and host are compatible.')
  }
  if (verdict.reason === 'client-too-old') {
    return translate(
      'runtime.compatibility.clientTooOld',
      'This Yiru client is too old for the selected runtime host. Update Yiru on this machine. Client protocol {{clientVersion}}, host requires client protocol {{requiredVersion}}.',
      {
        clientVersion: verdict.clientProtocolVersion,
        requiredVersion: verdict.requiredClientProtocolVersion ?? 0
      }
    )
  }
  return translate(
    'runtime.compatibility.hostTooOld',
    'The selected runtime host is too old for this client. Update Yiru on the host. Host protocol {{hostVersion}}, client requires host protocol {{requiredVersion}}.',
    {
      hostVersion: verdict.serverProtocolVersion,
      requiredVersion: verdict.requiredServerProtocolVersion ?? 0
    }
  )
}
