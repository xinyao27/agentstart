import {
  RuntimeProtocolError,
  StatusCode,
  type ShellSessionClient,
  type ShellSessionDocumentValue,
  type ShellSessionSnapshot
} from '@yiru/protocol'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'

import { sessionConflictScope } from './conflict-copy'
import { mergeSessionEdit } from './merge'
import { flushPendingSessionWrites } from './projection-scope'
import { subscribeSessionDocument } from './subscription'

type Listener = (session: ShellSessionDocumentValue, hostId?: string) => boolean
type Preparation = (
  session: ShellSessionDocumentValue,
  hostId: string | undefined,
  signal: AbortSignal
) => Promise<void>
type Edit = { base: ShellSessionDocumentValue; desired: ShellSessionDocumentValue }
type ConfirmedEdit = { edit: Edit; snapshot: ShellSessionSnapshot }
type HostState = {
  snapshot: ShellSessionSnapshot
  input: ShellSessionDocumentValue
  pending: Edit | null
  tail: Promise<void>
  projected?: { epoch: string; revision: bigint }
}

export class SessionDocumentClient {
  private readonly listeners = new Map<Listener, Preparation | undefined>()
  private readonly watches = new Map<string, () => void>()
  private readonly states = new Map<string, HostState>()
  constructor(privateClient: () => Promise<ShellSessionClient>) {
    this.openClient = privateClient
  }
  private readonly openClient: () => Promise<ShellSessionClient>

  async get(hostId?: string): Promise<ShellSessionDocumentValue> {
    const snapshot = await (await this.openClient()).get(hostId)
    const existing = this.states.get(hostId ?? '')
    if (existing) {
      if (existing.snapshot.version.epoch !== snapshot.version.epoch && existing.pending) {
        throw new Error(
          translate(
            'session.ownerChanged',
            'The workspace session was replaced. Your pending edits have not been saved.'
          )
        )
      }
      if (
        existing.snapshot.version.epoch !== snapshot.version.epoch ||
        existing.snapshot.version.revision <= snapshot.version.revision
      ) {
        existing.snapshot = snapshot
      }
      const merged = existing.pending
        ? mergeSessionEdit(
            existing.pending.base,
            existing.pending.desired,
            existing.snapshot.session
          )
        : { ok: true as const, document: existing.snapshot.session }
      if (!merged.ok) {
        throw new Error(translate('session.pending', 'Your edits remain pending.'))
      }
      existing.input = structuredClone(merged.document)
    } else {
      this.states.set(hostId ?? '', {
        snapshot,
        input: structuredClone(snapshot.session),
        pending: null,
        tail: Promise.resolve()
      })
    }
    this.watch(hostId)
    return structuredClone(this.states.get(hostId ?? '')!.input)
  }

  subscribe(listener: Listener, prepare?: Preparation): () => void {
    this.listeners.set(listener, prepare)
    for (const host of this.states.keys()) {
      this.watch(host || undefined)
    }
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) {
        for (const stop of this.watches.values()) {
          stop()
        }
        this.watches.clear()
        for (const state of this.states.values()) {
          delete state.projected
        }
      }
    }
  }

  private watch(hostId?: string): void {
    const key = hostId ?? ''
    if (this.listeners.size === 0 || this.watches.has(key)) {
      return
    }
    this.watches.set(
      key,
      subscribeSessionDocument(this.openClient, hostId, async (snapshot, signal) => {
        const initial = this.states.get(key)
        if (!initial) {
          return
        }
        if (
          initial.snapshot.version.epoch === snapshot.version.epoch &&
          initial.snapshot.version.revision > snapshot.version.revision
        ) {
          return
        }
        if (
          initial.projected?.epoch === snapshot.version.epoch &&
          initial.projected.revision === snapshot.version.revision
        ) {
          return
        }
        await Promise.all(
          [...this.listeners.values()].map((prepare) => prepare?.(snapshot.session, hostId, signal))
        )
        if (signal.aborted) {
          return
        }
        flushPendingSessionWrites()
        const state = this.states.get(key)
        if (!state) {
          return
        }
        if (
          state.snapshot.version.epoch === snapshot.version.epoch &&
          state.snapshot.version.revision > snapshot.version.revision
        ) {
          return
        }
        if (state.snapshot.version.epoch !== snapshot.version.epoch && state.pending) {
          toast.error(
            translate(
              'session.ownerChanged',
              'The workspace session was replaced. Your pending edits have not been saved.'
            )
          )
          return
        }
        state.snapshot = snapshot
        const merged = state.pending
          ? mergeSessionEdit(state.pending.base, state.pending.desired, snapshot.session)
          : { ok: true as const, document: snapshot.session }
        if (!merged.ok) {
          void this.enqueue(state, hostId).catch(() => {})
          return
        }
        for (const listener of this.listeners.keys()) {
          if (listener(merged.document, hostId)) {
            state.input = structuredClone(merged.document)
            state.projected = snapshot.version
          }
        }
      })
    )
  }

  write(
    value: ShellSessionDocumentValue,
    hostId: string | undefined,
    patch: boolean
  ): Promise<void> {
    const state = this.states.get(hostId ?? '')
    if (!state) {
      const error = new Error(
        translate('session.notLoaded', 'Load the workspace session before saving changes.')
      )
      toast.error(error.message)
      return Promise.reject(error)
    }
    const base = state.input
    const desired = structuredClone(patch ? { ...base, ...value } : value)
    state.input = desired
    state.pending = { base: state.pending?.base ?? base, desired }
    return this.enqueue(state, hostId)
  }

  async flush(): Promise<void> {
    for (const [host, state] of this.states) {
      await this.enqueue(state, host || undefined)
    }
    await (await this.openClient()).flush()
  }

  private enqueue(state: HostState, hostId?: string, confirmed?: ConfirmedEdit): Promise<void> {
    const work = state.tail.then(() => this.drain(state, hostId, confirmed))
    state.tail = work.catch(() => {})
    return work
  }

  private async drain(state: HostState, hostId?: string, confirmed?: ConfirmedEdit): Promise<void> {
    if (!state.pending) {
      return
    }
    const edit = confirmed?.edit ?? state.pending
    const force = confirmed !== undefined
    let confirmation: ConfirmedEdit | undefined
    try {
      const client = await this.openClient()
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const snapshot =
          confirmed?.snapshot ?? (attempt ? await client.get(hostId) : state.snapshot)
        if (snapshot.version.epoch !== state.snapshot.version.epoch) {
          throw new Error(
            translate(
              'session.ownerChanged',
              'The workspace session was replaced. Your pending edits have not been saved.'
            )
          )
        }
        state.snapshot = snapshot
        const merged = mergeSessionEdit(edit.base, edit.desired, snapshot.session, force)
        if (!merged.ok) {
          confirmation = { edit, snapshot }
          throw new Error(
            translate(
              'session.concurrentChangesScoped',
              'Another client changed {{scope}}. Your edits remain pending.',
              { scope: sessionConflictScope(merged.paths) }
            )
          )
        }
        try {
          const saved = await client.set(merged.document, snapshot.version, hostId)
          if (
            state.snapshot.version.epoch === saved.version.epoch &&
            state.snapshot.version.revision <= saved.version.revision
          ) {
            state.snapshot = saved
          }
          if (state.pending === edit) {
            state.pending = null
          } else if (state.pending) {
            state.pending = { base: edit.desired, desired: state.pending.desired }
          }
          toast.dismiss(this.toastId(hostId))
          if (state.pending) {
            void this.enqueue(state, hostId).catch(() => {})
          }
          return
        } catch (error) {
          if (
            force ||
            !(error instanceof RuntimeProtocolError) ||
            error.code !== StatusCode.ABORTED
          ) {
            throw error
          }
        }
      }
      throw new Error(
        translate(
          'session.busy',
          'The workspace is changing. Your edits remain pending; try saving again.'
        )
      )
    } catch (error) {
      toast.error(translate('session.saveFailed', 'Workspace changes could not be saved'), {
        id: this.toastId(hostId),
        description:
          error instanceof Error
            ? error.message
            : translate('session.pending', 'Your edits remain pending.'),
        duration: Infinity,
        action: {
          label: confirmation
            ? translate('session.replaceConflicts', 'Replace conflicting values')
            : translate('session.retrySave', 'Retry saving'),
          onClick: () => {
            void this.enqueue(state, hostId, confirmation).catch(() => {})
          }
        }
      })
      throw error
    }
  }

  private toastId(hostId?: string): string {
    return `session-save:${hostId ?? 'local'}`
  }
}
