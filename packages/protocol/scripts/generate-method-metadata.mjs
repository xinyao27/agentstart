// Why: transport policy annotations must become one deterministic Rust/TypeScript dispatch table.
import { readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Why: language generators do not expose one consistent method-policy API, so transport metadata
// is derived once from generated descriptors and emitted for TypeScript and Swift consumers.
import { getExtension, hasExtension } from '@bufbuild/protobuf'

import {
  method_policy as methodPolicyExtension,
  method_transport_policy as methodTransportPolicyExtension
} from '../typescript/generated/yiru/protocol/v1/annotations_pb.js'

const packageRoot = path.resolve(import.meta.dirname, '..')
const generatedTypescriptRoot = path.join(packageRoot, 'typescript', 'generated')
const typescriptOutputPath = path.join(generatedTypescriptRoot, 'method-metadata.generated.ts')
const swiftOutputPath = path.join(
  packageRoot,
  'swift',
  'Sources',
  'YiruProtocol',
  'Generated',
  'method-metadata.generated.swift'
)
const swiftKeywords = new Set([
  'Any',
  'Protocol',
  'Self',
  'Type',
  'as',
  'associatedtype',
  'break',
  'case',
  'catch',
  'class',
  'continue',
  'default',
  'defer',
  'deinit',
  'do',
  'else',
  'enum',
  'extension',
  'fallthrough',
  'false',
  'fileprivate',
  'for',
  'func',
  'guard',
  'if',
  'import',
  'in',
  'init',
  'inout',
  'internal',
  'is',
  'let',
  'nil',
  'open',
  'operator',
  'precedencegroup',
  'private',
  'protocol',
  'public',
  'repeat',
  'rethrows',
  'return',
  'self',
  'static',
  'struct',
  'subscript',
  'super',
  'switch',
  'throw',
  'throws',
  'true',
  'try',
  'typealias',
  'var',
  'where',
  'while'
])
const routeNames = new Map([
  [1, { swift: 'localOnly', typescript: 'LOCAL_ONLY' }],
  [2, { swift: 'environmentAllowed', typescript: 'ENVIRONMENT_ALLOWED' }]
])
const reconnectNames = new Map([
  [1, { swift: 'fail', typescript: 'FAIL' }],
  [2, { swift: 'restartFromRequest', typescript: 'RESTART_FROM_REQUEST' }]
])

const modulePaths = await collectGeneratedModules(generatedTypescriptRoot)
const services = []

for (const modulePath of modulePaths) {
  const generatedModule = await import(pathToFileURL(modulePath).href)
  for (const value of Object.values(generatedModule)) {
    if (isServiceDescriptor(value)) {
      services.push(value)
    }
  }
}

services.sort((left, right) => left.typeName.localeCompare(right.typeName))
const records = services.flatMap((service) =>
  service.methods.map((method) => methodRecord(service, method))
)
records.sort((left, right) => left.procedure.localeCompare(right.procedure))
validateUniqueProcedures(records)
await Promise.all([
  writeFile(typescriptOutputPath, renderTypescript(records)),
  writeFile(swiftOutputPath, renderSwift(services, records))
])

async function collectGeneratedModules(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const modules = []
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      modules.push(...(await collectGeneratedModules(entryPath)))
    } else if (entry.name.endsWith('_pb.js')) {
      modules.push(entryPath)
    }
  }
  return modules.sort()
}

function isServiceDescriptor(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    Reflect.get(value, 'kind') === 'service' &&
    typeof Reflect.get(value, 'typeName') === 'string' &&
    Array.isArray(Reflect.get(value, 'methods'))
  )
}

function methodRecord(service, method) {
  const procedure = `/${service.typeName}/${method.name}`
  const options = method.proto.options
  if (!options || !hasExtension(options, methodPolicyExtension)) {
    throw new Error(`${procedure} has no Yiru method policy`)
  }
  if (!hasExtension(options, methodTransportPolicyExtension)) {
    throw new Error(`${procedure} has no Yiru method transport policy`)
  }
  const policy = getExtension(options, methodPolicyExtension)
  const transport = getExtension(options, methodTransportPolicyExtension)
  requireKnownValue(policy.scope, new Set([1, 2, 3]), procedure, 'scope')
  requireKnownValue(policy.tier, new Set([1, 2, 3]), procedure, 'tier')
  requireKnownList(policy.callers, new Set([1, 2, 3]), procedure, 'callers', true)
  requireKnownList(policy.peerKinds, new Set([1, 2, 3, 4]), procedure, 'peer_kinds', false)
  requireKnownValue(transport.route, routeNames, procedure, 'route')
  requireKnownValue(transport.streamReconnect, reconnectNames, procedure, 'stream_reconnect')
  if (
    transport.streamReconnect === 2 &&
    (method.proto.clientStreaming || !method.proto.serverStreaming)
  ) {
    throw new Error(`${procedure} restarts from its request but is not a server-only stream`)
  }
  return {
    clientStreaming: method.proto.clientStreaming,
    localName: method.localName,
    procedure,
    reconnect: transport.streamReconnect,
    route: transport.route,
    serverStreaming: method.proto.serverStreaming,
    service: service.typeName
  }
}

function requireKnownValue(value, knownValues, procedure, field) {
  if (value === 0 || !knownValues.has(value)) {
    throw new Error(`${procedure} has invalid ${field} value ${value}`)
  }
}

function requireKnownList(values, knownValues, procedure, field, required) {
  if (!Array.isArray(values) || (required && values.length === 0)) {
    throw new Error(`${procedure} has invalid ${field}`)
  }
  for (const value of values) {
    requireKnownValue(value, knownValues, procedure, field)
  }
}

function validateUniqueProcedures(records) {
  const procedures = new Set()
  for (const record of records) {
    if (procedures.has(record.procedure)) {
      throw new Error(`Generated procedure ${record.procedure} is duplicated`)
    }
    procedures.add(record.procedure)
  }
}

function renderTypescript(records) {
  const lines = [
    '// @generated by packages/protocol/scripts/generate-method-metadata.mjs. Do not edit.',
    'import {',
    '  RuntimeRoutePolicy,',
    '  StreamReconnectPolicy',
    "} from './yiru/protocol/v1/annotations_pb.js'",
    '',
    'export type MethodTransportMetadata = {',
    '  readonly clientStreaming: boolean',
    '  readonly procedure: string',
    '  readonly route: RuntimeRoutePolicy',
    '  readonly serverStreaming: boolean',
    '  readonly streamReconnect: StreamReconnectPolicy',
    '}',
    '',
    'export const METHOD_TRANSPORT_METADATA = {'
  ]
  for (const record of records) {
    const route = routeNames.get(record.route)
    const reconnect = reconnectNames.get(record.reconnect)
    lines.push(`  '${record.procedure}': {`)
    lines.push(`    clientStreaming: ${record.clientStreaming},`)
    lines.push(`    procedure: '${record.procedure}',`)
    lines.push(`    route: RuntimeRoutePolicy.${route.typescript},`)
    lines.push(`    serverStreaming: ${record.serverStreaming},`)
    lines.push(`    streamReconnect: StreamReconnectPolicy.${reconnect.typescript}`)
    lines.push('  },')
  }
  lines.push(
    '} as const satisfies Readonly<Record<string, MethodTransportMetadata>>',
    '',
    'export const METHOD_TRANSPORT_METADATA_BY_PROCEDURE: Readonly<',
    '  Record<string, MethodTransportMetadata | undefined>',
    '> = METHOD_TRANSPORT_METADATA',
    '',
    'export type RuntimeProcedure = keyof typeof METHOD_TRANSPORT_METADATA'
  )
  return `${lines.join('\n')}\n`
}

function renderSwift(services, records) {
  const lines = [
    '// @generated by packages/protocol/scripts/generate-method-metadata.mjs. Do not edit.',
    '',
    'public struct YiruMethodTransportMetadata: Sendable {',
    '  public let procedure: String',
    '  public let route: Yiru_Protocol_V1_RuntimeRoutePolicy',
    '  public let streamReconnect: Yiru_Protocol_V1_StreamReconnectPolicy',
    '  public let clientStreaming: Bool',
    '  public let serverStreaming: Bool',
    '}',
    ''
  ]
  for (const service of services) {
    const typeName = `${swiftIdentifier(service.typeName, true)}Methods`
    lines.push(`public enum ${typeName} {`)
    const methods = [...service.methods].sort((left, right) => left.name.localeCompare(right.name))
    for (const method of methods) {
      const localName = swiftIdentifier(method.localName, false)
      lines.push(`  public static let ${localName} =`)
      lines.push(`    "/${service.typeName}/${method.name}"`)
    }
    lines.push('}', '')
  }
  lines.push('public enum YiruMethodMetadata {', '  public static let byProcedure = [')
  for (const record of records) {
    const route = routeNames.get(record.route)
    const reconnect = reconnectNames.get(record.reconnect)
    lines.push(`    "${record.procedure}": YiruMethodTransportMetadata(`)
    lines.push(`      procedure: "${record.procedure}",`)
    lines.push(`      route: .${route.swift},`)
    lines.push(`      streamReconnect: .${reconnect.swift},`)
    lines.push(`      clientStreaming: ${record.clientStreaming},`)
    lines.push(`      serverStreaming: ${record.serverStreaming}`)
    lines.push('    ),')
  }
  lines.push('  ]', '}')
  return `${lines.join('\n')}\n`
}

function swiftIdentifier(value, upperFirst) {
  const parts = value.split(/[^A-Za-z0-9]+/u).filter(Boolean)
  const joined = parts
    .map((part, index) => (index > 0 || upperFirst ? capitalize(part) : part))
    .join('')
  if (!joined || /^[0-9]/u.test(joined)) {
    throw new Error(`Cannot generate a Swift identifier from ${value}`)
  }
  return swiftKeywords.has(joined) ? `\`${joined}\`` : joined
}

function capitalize(value) {
  return `${value[0].toUpperCase()}${value.slice(1)}`
}
