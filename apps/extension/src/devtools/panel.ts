import { mountExtensionDevTools } from '@agentstart/client/extension-devtools'

import { createBrowserCapabilities } from '../bootstrap/browser-capabilities'
import { requestRuntimeBootstrap } from '../runtime/bootstrap'
import { createExtensionRuntimeHostFactory } from '../runtime/client'

type BootstrapResponse = {
  ok: boolean
  result?: {
    authToken: string
    endpoint: string
    expectedRuntimeId: string | null
    protocolVersion: number
    rpcProtocol: 'agentstart-protobuf-v2'
  }
}

const response: unknown = await chrome.runtime.sendMessage({ type: 'bootstrap' })
if (isBootstrapResponse(response)) {
  await installConsoleCapture()
  const browserCapabilities = createBrowserCapabilities(response.result)
  mountExtensionDevTools(
    createExtensionRuntimeHostFactory(
      response.result,
      requestRuntimeBootstrap,
      browserCapabilities.executeBrowserCommand
    ),
    {
      evaluate: evaluateInspectedWindow,
      readDiagnostics: async () => [
        ...(await readConsoleDiagnostics()),
        ...(await readNetworkDiagnostics())
      ]
    }
  )
}

async function installConsoleCapture(): Promise<void> {
  await evaluateInspectedWindow(`(() => {
    if (globalThis.__agentstartDevToolsConsole) return;
    const rows = [];
    const original = console.error;
    console.error = function (...args) {
      try {
        rows.push({ at: Date.now(), text: args.map((value) => {
          if (typeof value === 'string') return value;
          try { return JSON.stringify(value); } catch { return String(value); }
        }).join(' ').slice(0, 16000) });
        if (rows.length > 100) rows.splice(0, rows.length - 100);
      } finally {
        original.apply(this, args);
      }
    };
    globalThis.__agentstartDevToolsConsole = rows;
  })()`)
}

async function readConsoleDiagnostics(): Promise<
  {
    detail: string
    id: string
    kind: 'console'
    title: string
  }[]
> {
  const evaluated = await evaluateInspectedWindow('globalThis.__agentstartDevToolsConsole ?? []')
  if (!Array.isArray(evaluated)) {
    return []
  }
  return evaluated.flatMap((row, index) => {
    if (typeof row !== 'object' || row === null || typeof Reflect.get(row, 'text') !== 'string') {
      return []
    }
    const detail = String(Reflect.get(row, 'text')).slice(0, 16_000)
    return [{ detail, id: `console:${index}:${detail}`, kind: 'console' as const, title: detail }]
  })
}

async function readNetworkDiagnostics(): Promise<
  {
    detail: string
    id: string
    kind: 'network'
    title: string
  }[]
> {
  const rawHar = await readNetworkHar()
  const failures = parseHarEntries(rawHar)
    .filter((entry) => entry.response.status >= 400 || entry.response.status === 0)
    .slice(-40)
  return Promise.all(
    failures.map(async (entry, index) => {
      const responseBody = await readHarResponseBody(entry)
      const detail = JSON.stringify({
        method: entry.request.method,
        requestBody: entry.request.postData,
        requestHeaders: entry.request.headers.slice(0, 40),
        responseBody,
        responseHeaders: entry.response.headers.slice(0, 40),
        status: entry.response.status,
        statusText: entry.response.statusText,
        url: entry.request.url
      }).slice(0, 64_000)
      return {
        detail,
        id: `network:${index}:${entry.startedDateTime}:${entry.request.url}`,
        kind: 'network' as const,
        title: `${entry.response.status || 'ERR'} ${entry.request.method} ${entry.request.url}`
      }
    })
  )
}

type HarEntry = {
  getContent: unknown
  request: { headers: unknown[]; method: string; postData: string | null; url: string }
  response: { headers: unknown[]; status: number; statusText: string }
  source: object
  startedDateTime: string
}

function parseHarEntries(value: unknown): HarEntry[] {
  const entries = typeof value === 'object' && value !== null ? Reflect.get(value, 'entries') : null
  if (!Array.isArray(entries)) {
    return []
  }
  return entries.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return []
    }
    const request = Reflect.get(entry, 'request')
    const response = Reflect.get(entry, 'response')
    const startedDateTime = Reflect.get(entry, 'startedDateTime')
    if (
      typeof request !== 'object' ||
      request === null ||
      typeof response !== 'object' ||
      response === null ||
      typeof Reflect.get(request, 'method') !== 'string' ||
      typeof Reflect.get(request, 'url') !== 'string' ||
      typeof Reflect.get(response, 'status') !== 'number'
    ) {
      return []
    }
    return [
      {
        getContent: Reflect.get(entry, 'getContent'),
        request: {
          headers: Array.isArray(Reflect.get(request, 'headers'))
            ? Reflect.get(request, 'headers')
            : [],
          method: Reflect.get(request, 'method'),
          postData: readHarPostData(request),
          url: Reflect.get(request, 'url')
        },
        response: {
          headers: Array.isArray(Reflect.get(response, 'headers'))
            ? Reflect.get(response, 'headers')
            : [],
          status: Reflect.get(response, 'status'),
          statusText:
            typeof Reflect.get(response, 'statusText') === 'string'
              ? Reflect.get(response, 'statusText')
              : ''
        },
        source: entry,
        startedDateTime: typeof startedDateTime === 'string' ? startedDateTime : ''
      }
    ]
  })
}

function readHarPostData(request: object): string | null {
  const postData = Reflect.get(request, 'postData')
  const text =
    typeof postData === 'object' && postData !== null ? Reflect.get(postData, 'text') : null
  return typeof text === 'string' ? text.slice(0, 16_000) : null
}

function readHarResponseBody(entry: HarEntry): Promise<string | null> {
  const getContent = entry.getContent
  if (typeof getContent !== 'function') {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    Reflect.apply(getContent, entry.source, [
      (content: string, encoding: string) => {
        const body =
          encoding === 'base64' ? `[base64 response, ${content.length} characters]` : content
        resolve(body.slice(0, 32_000))
      }
    ])
  })
}

function isBootstrapResponse(value: unknown): value is BootstrapResponse & {
  ok: true
  result: NonNullable<BootstrapResponse['result']>
} {
  const result = typeof value === 'object' && value !== null ? Reflect.get(value, 'result') : null
  const expectedRuntimeId =
    typeof result === 'object' && result !== null
      ? Reflect.get(result, 'expectedRuntimeId')
      : undefined
  return (
    typeof value === 'object' &&
    value !== null &&
    Reflect.get(value, 'ok') === true &&
    typeof result === 'object' &&
    result !== null &&
    typeof Reflect.get(result, 'authToken') === 'string' &&
    typeof Reflect.get(result, 'endpoint') === 'string' &&
    (expectedRuntimeId === null || typeof expectedRuntimeId === 'string') &&
    typeof Reflect.get(result, 'protocolVersion') === 'number' &&
    Reflect.get(result, 'rpcProtocol') === 'agentstart-protobuf-v2'
  )
}

function evaluateInspectedWindow(expression: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // Why: inspectedWindow.eval only gained a Promise overload in Chrome 151;
    // AgentStart supports Chrome 120+, so the callback form remains the compatibility path.
    const evaluate: unknown = chrome.devtools.inspectedWindow.eval
    if (typeof evaluate !== 'function') {
      reject(new Error('devtools_evaluation_unavailable'))
      return
    }
    Reflect.apply(evaluate, chrome.devtools.inspectedWindow, [
      expression,
      (result: unknown, exceptionInfo: unknown) => {
        const runtimeError = runtimeLastError()
        if (runtimeError) {
          reject(new Error(runtimeError))
          return
        }
        const evaluationError = evaluationFailure(exceptionInfo)
        if (evaluationError) {
          reject(new Error(evaluationError))
          return
        }
        resolve(result)
      }
    ])
  })
}

function readNetworkHar(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const getHar: unknown = chrome.devtools.network.getHAR
    if (typeof getHar !== 'function') {
      reject(new Error('devtools_network_har_unavailable'))
      return
    }
    Reflect.apply(getHar, chrome.devtools.network, [
      (har: unknown) => {
        const runtimeError = runtimeLastError()
        if (runtimeError) {
          reject(new Error(runtimeError))
          return
        }
        resolve(har)
      }
    ])
  })
}

function evaluationFailure(value: unknown): string | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    (Reflect.get(value, 'isException') !== true && Reflect.get(value, 'isError') !== true)
  ) {
    return null
  }
  const detail = Reflect.get(value, 'value') ?? Reflect.get(value, 'code')
  return typeof detail === 'string' ? detail : 'devtools_evaluation_failed'
}

function runtimeLastError(): string | null {
  const error: unknown = Reflect.get(chrome.runtime, 'lastError')
  const message = typeof error === 'object' && error !== null ? Reflect.get(error, 'message') : null
  return typeof message === 'string' ? message : null
}
