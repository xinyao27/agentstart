type RegistrationResult = {
  authenticatorData: string
  clientDataJson: string
  credentialId: string
  publicKeySpki: string
}

type AssertionResult = {
  authenticatorData: string
  clientDataJson: string
  credentialId: string
  signature: string
}

export async function createDangerousCredential(input: {
  challenge: string
  userId: string
}): Promise<RegistrationResult> {
  const result = await navigator.credentials.create({
    publicKey: {
      attestation: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required'
      },
      challenge: decodeBase64Url(input.challenge),
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
      rp: { name: 'AgentStart' },
      timeout: 120_000,
      user: {
        displayName: translate('passkeyDisplayName', 'AgentStart local approval'),
        id: decodeBase64Url(input.userId),
        name: 'local-user'
      }
    }
  })
  if (!(result instanceof PublicKeyCredential)) {
    throw new Error('passkey_registration_cancelled')
  }
  const response = result.response
  if (!(response instanceof AuthenticatorAttestationResponse)) {
    throw new Error('passkey_registration_invalid')
  }
  const publicKey = response.getPublicKey()
  const authenticatorData = response.getAuthenticatorData()
  if (!publicKey) {
    throw new Error('passkey_public_key_unavailable')
  }
  return {
    authenticatorData: encodeBase64Url(authenticatorData),
    clientDataJson: encodeBase64Url(response.clientDataJSON),
    credentialId: encodeBase64Url(result.rawId),
    publicKeySpki: encodeBase64Url(publicKey)
  }
}

export async function requestDangerousAssertion(input: {
  challenge: string
  credentialId: string
}): Promise<AssertionResult> {
  const result = await navigator.credentials.get({
    publicKey: {
      allowCredentials: [{ id: decodeBase64Url(input.credentialId), type: 'public-key' }],
      challenge: decodeBase64Url(input.challenge),
      timeout: 120_000,
      userVerification: 'required'
    }
  })
  if (!(result instanceof PublicKeyCredential)) {
    throw new Error('passkey_approval_cancelled')
  }
  const response = result.response
  if (!(response instanceof AuthenticatorAssertionResponse)) {
    throw new Error('passkey_assertion_invalid')
  }
  return {
    authenticatorData: encodeBase64Url(response.authenticatorData),
    clientDataJson: encodeBase64Url(response.clientDataJSON),
    credentialId: encodeBase64Url(result.rawId),
    signature: encodeBase64Url(response.signature)
  }
}

function decodeBase64Url(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const decoded = atob(padded)
  const bytes = new Uint8Array(decoded.length)
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index)
  }
  return bytes.buffer
}

function encodeBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
import { translate } from '../i18n/translate'
