import type { BrowserReplayEvent } from '@agentstart/protocol'

import { isRecording, replayRecording, startRecording, stopRecording } from './recording'

type Respond = (response: unknown) => void

export function handleRecordingMessage(message: object, respond: Respond): boolean | null {
  const type = Reflect.get(message, 'type')
  if (
    type !== 'recording-status' &&
    type !== 'recording-start' &&
    type !== 'recording-stop' &&
    type !== 'recording-replay'
  ) {
    return null
  }
  const tabId = Reflect.get(message, 'tabId')
  if (typeof tabId !== 'number' || !Number.isInteger(tabId)) {
    respond({ error: 'invalid_tab_id', ok: false })
    return false
  }
  if (type === 'recording-status') {
    respond({ isRecording: isRecording(tabId), ok: true })
    return false
  }
  const task =
    type === 'recording-start'
      ? startRecording(tabId).then(() => ({ ok: true }))
      : type === 'recording-stop'
        ? stopRecording(tabId).then((capture) => ({ capture, ok: true }))
        : replayFromMessage(tabId, Reflect.get(message, 'events')).then(() => ({ ok: true }))
  void task.then(respond, (error: unknown) =>
    respond({ error: error instanceof Error ? error.message : String(error), ok: false })
  )
  return true
}

async function replayFromMessage(tabId: number, value: unknown): Promise<void> {
  const events = parseReplayEvents(value)
  if (!events) {
    throw new Error('invalid_replay_events')
  }
  await replayRecording(tabId, events)
}

function parseReplayEvents(value: unknown): BrowserReplayEvent[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const events: BrowserReplayEvent[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) {
      return null
    }
    const at = Reflect.get(item, 'at')
    const kind = Reflect.get(item, 'kind')
    const selector = Reflect.get(item, 'selector')
    const key = Reflect.get(item, 'key')
    const eventValue = Reflect.get(item, 'value')
    if (
      typeof at !== 'number' ||
      (kind !== 'click' && kind !== 'input' && kind !== 'keydown') ||
      typeof selector !== 'string' ||
      (key !== undefined && typeof key !== 'string') ||
      (eventValue !== undefined && typeof eventValue !== 'string')
    ) {
      return null
    }
    events.push({
      at,
      kind,
      selector,
      ...(typeof key === 'string' ? { key } : {}),
      ...(typeof eventValue === 'string' ? { value: eventValue } : {})
    })
  }
  return events
}
