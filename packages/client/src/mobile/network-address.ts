const IPV4_OCTET = '(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])'
const IPV4_REGEX = new RegExp(`^(?:${IPV4_OCTET}\\.){3}${IPV4_OCTET}$`)
const HOSTNAME_LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
const HOSTNAME_REGEX = new RegExp(`^(?:${HOSTNAME_LABEL}\\.)*${HOSTNAME_LABEL}$`, 'i')
const HOSTNAME_MAX_LENGTH = 253
const MIN_PORT = 1
const MAX_PORT = 65_535

export type ParseManualAddressResult = { ok: true; address: string } | { ok: false }

export function parseManualNetworkAddress(input: string): ParseManualAddressResult {
  const trimmed = input.trim()
  if (trimmed === '' || /\s/.test(trimmed)) {
    return invalidAddress()
  }

  const { host, port } = splitHostPort(trimmed)
  if (host === '' || host.length > HOSTNAME_MAX_LENGTH || (port !== null && !isValidPort(port))) {
    return invalidAddress()
  }
  if (IPV4_REGEX.test(host)) {
    return { ok: true, address: trimmed }
  }

  // Why: WHATWG treats a numeric final label as an IPv4 signal. A valid IPv4 was
  // already accepted, so accepting one here could silently resolve a different host.
  const lastLabel = host.split('.').at(-1) ?? ''
  if (/^[0-9]+$/.test(lastLabel) || /^0x[0-9a-f]*$/i.test(lastLabel)) {
    return invalidAddress()
  }
  return HOSTNAME_REGEX.test(host) ? { ok: true, address: trimmed } : invalidAddress()
}

function splitHostPort(value: string): { host: string; port: string | null } {
  const firstColon = value.indexOf(':')
  if (firstColon === -1 || value.includes(':', firstColon + 1)) {
    return { host: value, port: null }
  }
  return { host: value.slice(0, firstColon), port: value.slice(firstColon + 1) }
}

function isValidPort(port: string): boolean {
  if (!/^[1-9][0-9]*$/.test(port)) {
    return false
  }
  const value = Number(port)
  return value >= MIN_PORT && value <= MAX_PORT
}

function invalidAddress(): ParseManualAddressResult {
  return { ok: false }
}

export function isTailnetIPv4Address(address: string): boolean {
  const parts = address.split('.')
  if (parts.length !== 4) {
    return false
  }

  const octets = parts.map((part) => {
    if (!/^\d+$/.test(part)) {
      return Number.NaN
    }
    return Number(part)
  })

  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false
  }

  // Why: Tailnet IPv4 addresses live in 100.64.0.0/10. Prefer them for
  // phone pairing because LAN addresses stop working once devices split networks.
  return octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127
}
