import { spawn, spawnSync } from 'node:child_process'
import { join } from 'node:path'

const SETUP_DEADLINE_MS = 5 * 60_000
const FORCE_TERMINATION_DELAY_MS = 5_000

export function createInstallControl() {
  const control = {
    controllers: new Set(),
    dispose: () => {},
    forceTimer: null,
    receivedSignal: null,
    setupChild: null,
    setupTimedOut: false
  }
  const handlers = new Map()
  for (const signal of supportedInstallSignals()) {
    const handler = () => {
      if (control.receivedSignal) {
        return
      }
      control.receivedSignal = signal
      for (const controller of control.controllers) {
        controller.abort(new Error(`AgentStart installation interrupted by ${signal}.`))
      }
      if (control.setupChild) {
        terminateSetupProcess(control.setupChild, signal, control)
      }
    }
    handlers.set(signal, handler)
    process.on(signal, handler)
  }
  control.dispose = () => {
    for (const [signal, handler] of handlers) {
      process.off(signal, handler)
    }
    clearTimeout(control.forceTimer)
  }
  return control
}

export async function runRequiredSetup(executablePath, argumentsList, control) {
  throwIfInterrupted(control)
  await new Promise((resolvePromise, reject) => {
    let settled = false
    const child = spawn(executablePath, argumentsList, {
      detached: process.platform !== 'win32',
      stdio: 'inherit',
      windowsHide: true
    })
    control.setupChild = child
    const timer = deadlineTimer(() => {
      control.setupTimedOut = true
      terminateSetupProcess(child, 'SIGTERM', control)
    }, SETUP_DEADLINE_MS)
    const settle = (operation) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      clearTimeout(control.forceTimer)
      control.forceTimer = null
      control.setupChild = null
      operation()
    }
    child.once('error', (error) => settle(() => reject(error)))
    child.once('exit', (code, signal) =>
      settle(() => {
        if (control.receivedSignal) {
          reject(new Error(`AgentStart setup interrupted by ${control.receivedSignal}.`))
        } else if (control.setupTimedOut) {
          reject(new Error(`AgentStart setup exceeded ${SETUP_DEADLINE_MS} milliseconds.`))
        } else if (code === 0) {
          resolvePromise()
        } else {
          reject(new Error(`AgentStart setup failed with ${signal || `exit ${code}`}.`))
        }
      })
    )
  })
}

export function throwIfInterrupted(control) {
  if (control.receivedSignal) {
    throw { installSignal: control.receivedSignal }
  }
}

function terminateSetupProcess(child, signal, control) {
  if (!child.pid) {
    return
  }
  try {
    if (process.platform === 'win32') {
      spawnSync(windowsSystemExecutable('taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'])
      return
    }
    process.kill(-child.pid, signal)
    if (!control.forceTimer) {
      control.forceTimer = deadlineTimer(() => {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {
          child.kill('SIGKILL')
        }
      }, FORCE_TERMINATION_DELAY_MS)
    }
  } catch {
    child.kill(signal)
  }
}

function supportedInstallSignals() {
  return process.platform === 'win32'
    ? ['SIGINT', 'SIGTERM', 'SIGBREAK']
    : ['SIGHUP', 'SIGINT', 'SIGTERM']
}

function windowsSystemExecutable(name) {
  const root = process.env.SystemRoot?.trim()
  return root ? join(root, 'System32', name) : name
}

function deadlineTimer(callback, milliseconds) {
  const timer = setTimeout(() => callback(), milliseconds)
  timer.unref()
  return timer
}
