import { createHash } from 'node:crypto'
import { chmodSync, closeSync, fsyncSync, openSync, rmSync, writeSync } from 'node:fs'
import { join } from 'node:path'

const MAX_BINARY_BYTES = 256 * 1024 * 1024
const MAX_CHECKSUM_BYTES = 1024 * 1024
const CONNECTION_DEADLINE_MS = 15_000
const BINARY_DEADLINE_MS = 120_000
const CHECKSUM_DEADLINE_MS = 30_000

export async function prepareReleaseCandidate(options) {
  const candidatePath = join(options.directory, 'candidate')
  const downloads = [
    abortPeersOnFailure(
      downloadBoundedFile(
        `${options.releaseBase}/${options.assetName}`,
        candidatePath,
        MAX_BINARY_BYTES,
        BINARY_DEADLINE_MS,
        options.control
      ),
      options.control
    ),
    abortPeersOnFailure(
      downloadBoundedBytes(
        `${options.releaseBase}/agentstart-checksums.txt`,
        MAX_CHECKSUM_BYTES,
        CHECKSUM_DEADLINE_MS,
        options.control
      ),
      options.control
    )
  ]
  const results = await Promise.allSettled(downloads)
  const failure = results.find((result) => result.status === 'rejected')
  if (failure) {
    throw failure.reason
  }
  const [actualChecksum, checksums] = results.map((result) => result.value)
  const expectedChecksum = findChecksum(checksums.toString('utf8'), options.assetName)
  if (actualChecksum !== expectedChecksum) {
    throw new Error(`Checksum verification failed for ${options.assetName}.`)
  }
  chmodSync(candidatePath, 0o755)
  syncFile(candidatePath)
  return candidatePath
}

async function abortPeersOnFailure(download, control) {
  try {
    return await download
  } catch (error) {
    for (const controller of control.controllers) {
      controller.abort(error)
    }
    throw error
  }
}

async function downloadBoundedFile(url, path, maximum, totalDeadlineMs, control) {
  const descriptor = openSync(path, 'wx', 0o600)
  let opened
  let completed = false
  try {
    opened = await openReleaseResponse(url, maximum, totalDeadlineMs, control)
    const digest = createHash('sha256')
    let received = 0
    const reader = opened.response.body?.getReader()
    if (!reader) {
      throw new Error(`Release response for ${url} has no body.`)
    }
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        break
      }
      received = checkedReceivedBytes(received, chunk.value.byteLength, maximum, url)
      digest.update(chunk.value)
      let offset = 0
      while (offset < chunk.value.byteLength) {
        offset += writeSync(descriptor, chunk.value, offset, chunk.value.byteLength - offset)
      }
    }
    verifyReceivedBytes(received, opened.declaredBytes, url)
    if (received === 0) {
      throw new Error(`Release artifact ${url} is empty.`)
    }
    fsyncSync(descriptor)
    completed = true
    return digest.digest('hex')
  } catch (error) {
    opened?.abort(error)
    throw error
  } finally {
    closeSync(descriptor)
    opened?.finish()
    if (!completed) {
      rmSync(path, { force: true })
    }
  }
}

async function downloadBoundedBytes(url, maximum, totalDeadlineMs, control) {
  const opened = await openReleaseResponse(url, maximum, totalDeadlineMs, control)
  const chunks = []
  let received = 0
  try {
    const reader = opened.response.body?.getReader()
    if (!reader) {
      throw new Error(`Release response for ${url} has no body.`)
    }
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        break
      }
      received = checkedReceivedBytes(received, chunk.value.byteLength, maximum, url)
      chunks.push(Buffer.from(chunk.value))
    }
    verifyReceivedBytes(received, opened.declaredBytes, url)
    return Buffer.concat(chunks, received)
  } catch (error) {
    opened.abort(error)
    throw error
  } finally {
    opened.finish()
  }
}

async function openReleaseResponse(url, maximum, totalDeadlineMs, control) {
  const controller = new AbortController()
  control.controllers.add(controller)
  const connectionTimer = deadlineTimer(
    () => controller.abort(new Error(`Connection deadline exceeded for ${url}.`)),
    CONNECTION_DEADLINE_MS
  )
  const totalTimer = deadlineTimer(
    () => controller.abort(new Error(`Download deadline exceeded for ${url}.`)),
    totalDeadlineMs
  )
  const finish = () => {
    clearTimeout(connectionTimer)
    clearTimeout(totalTimer)
    control.controllers.delete(controller)
  }
  try {
    const response = await fetch(url, {
      headers: { 'accept-encoding': 'identity' },
      redirect: 'follow',
      signal: controller.signal
    })
    clearTimeout(connectionTimer)
    if (!response.ok) {
      throw new Error(`Release request failed with HTTP ${response.status}: ${url}`)
    }
    if (!response.url.startsWith('https://')) {
      throw new Error(`Release request redirected outside HTTPS: ${response.url}`)
    }
    return {
      abort: (error) => controller.abort(error),
      declaredBytes: declaredContentLength(response, maximum, url),
      finish,
      response
    }
  } catch (error) {
    controller.abort(error)
    finish()
    throw error
  }
}

function declaredContentLength(response, maximum, url) {
  const header = response.headers.get('content-length')
  if (header === null) {
    return null
  }
  if (!/^\d+$/.test(header)) {
    throw new Error(`Release response has an invalid Content-Length: ${url}`)
  }
  const declared = Number(header)
  if (!Number.isSafeInteger(declared) || declared > maximum) {
    throw new Error(`Release response exceeds ${maximum} bytes: ${url}`)
  }
  return declared
}

function checkedReceivedBytes(received, added, maximum, url) {
  const next = received + added
  if (!Number.isSafeInteger(next) || next > maximum) {
    throw new Error(`Release response exceeds ${maximum} bytes: ${url}`)
  }
  return next
}

function verifyReceivedBytes(received, declared, url) {
  if (declared !== null && received !== declared) {
    throw new Error(`Release response length changed from ${declared} to ${received}: ${url}`)
  }
}

function findChecksum(checksums, name) {
  let checksum = null
  for (const line of checksums.split('\n')) {
    const fields = line.trim().split(/\s+/)
    if (fields[1] !== name) {
      continue
    }
    if (checksum || fields.length !== 2 || !/^[a-f\d]{64}$/.test(fields[0])) {
      throw new Error(`The release checksum list has an invalid duplicate for ${name}.`)
    }
    checksum = fields[0]
  }
  if (!checksum) {
    throw new Error(`The release checksum list does not contain one valid entry for ${name}.`)
  }
  return checksum
}

function syncFile(path) {
  const descriptor = openSync(path, 'r')
  try {
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}

function deadlineTimer(callback, milliseconds) {
  const timer = setTimeout(() => callback(), milliseconds)
  timer.unref()
  return timer
}
