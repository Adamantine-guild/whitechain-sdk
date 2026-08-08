import { ValidationError } from '../errors/index.js'
import {
  createMemoryStorage,
  type PipelineEvent,
  type PipelineListener,
  type PipelineSnapshot,
  type PipelineStatus,
  type PipelineStorage,
  type StepDefinition,
  type StepHelpers,
  type StepResult,
  type StepSnapshot,
  type StepStatus,
} from './states.js'

export interface TransactionPipelineOptions<TContext extends Record<string, unknown> = Record<string, unknown>> {
  /** Unique id used as storage key suffix. */
  id: string
  steps: StepDefinition<TContext>[]
  /** Initial context object (must be JSON-serializable for checkpoints). */
  initialContext?: TContext
  /** Persist checkpoints after each step transition. */
  storage?: PipelineStorage
  /** Storage key prefix (default: `whitechain:pipeline:`). */
  storageKeyPrefix?: string
  /** Auto-persist on every state change (default: true when storage is set). */
  autoCheckpoint?: boolean
}

export type { PipelineSnapshot, PipelineStatus, StepDefinition, StepSnapshot }

/**
 * Lightweight finite-state transaction pipeline for multi-step DeFi flows
 * (approve → deposit → stake, etc.).
 *
 * - Sequential step execution with typed progress events
 * - Wallet rejections / step failures halt cleanly without wiping prior step metadata
 * - JSON-serializable checkpoints for localStorage resume
 *
 * @example
 * ```ts
 * const pipeline = new TransactionPipeline({
 *   id: 'vault-deposit',
 *   storage: createLocalStorageAdapter(),
 *   steps: [
 *     { id: 'approve', run: async (ctx, h) => { const hash = await approve(); h.updateContext({ approvalHash: hash }); return { transactionHash: hash } } },
 *     { id: 'deposit', run: async (ctx) => ({ transactionHash: await deposit(ctx.approvalHash) }) },
 *   ],
 * })
 * pipeline.onStateChange((e) => console.log(e.status, e.step?.id))
 * await pipeline.start()
 * // later after refresh:
 * await pipeline.resume()
 * ```
 */
export class TransactionPipeline<TContext extends Record<string, unknown> = Record<string, unknown>> {
  public readonly id: string
  private readonly _stepDefs: StepDefinition<TContext>[]
  private readonly _storage?: PipelineStorage
  private readonly _storageKey: string
  private readonly _autoCheckpoint: boolean
  private readonly _listeners = new Set<PipelineListener<TContext>>()

  private _status: PipelineStatus = 'idle'
  private _currentStepIndex = 0
  private _steps: StepSnapshot[]
  private _context: TContext
  private _createdAt: string
  private _updatedAt: string
  private _errorMessage?: string
  private _cancelRequested = false
  private _running = false

  constructor(options: TransactionPipelineOptions<TContext>) {
    if (!options?.id) throw new ValidationError('TransactionPipeline requires an id')
    if (!options.steps?.length) {
      throw new ValidationError('TransactionPipeline requires at least one step')
    }

    this.id = options.id
    this._stepDefs = options.steps
    this._storage = options.storage
    this._storageKey = `${options.storageKeyPrefix ?? 'whitechain:pipeline:'}${options.id}`
    this._autoCheckpoint = options.autoCheckpoint ?? !!options.storage
    this._context = { ...(options.initialContext ?? ({} as TContext)) }
    this._createdAt = new Date().toISOString()
    this._updatedAt = this._createdAt
    this._steps = options.steps.map((s, index) => ({
      id: s.id,
      label: s.label,
      status: 'pending' as StepStatus,
      index,
    }))
  }

  public get status(): PipelineStatus {
    return this._status
  }

  public get currentStepIndex(): number {
    return this._currentStepIndex
  }

  public get context(): Readonly<TContext> {
    return this._context
  }

  /** Subscribe to all pipeline events (state changes, step lifecycle). */
  public onStateChange(listener: PipelineListener<TContext>): () => void {
    this._listeners.add(listener)
    return () => {
      this._listeners.delete(listener)
    }
  }

  /** Alias for onStateChange. */
  public subscribe(listener: PipelineListener<TContext>): () => void {
    return this.onStateChange(listener)
  }

  /** Fully serializable snapshot suitable for localStorage. */
  public getSnapshot(): PipelineSnapshot<TContext> {
    return {
      version: 1,
      pipelineId: this.id,
      status: this._status,
      currentStepIndex: this._currentStepIndex,
      steps: this._steps.map((s) => ({ ...s, meta: s.meta ? { ...s.meta } : undefined })),
      context: JSON.parse(JSON.stringify(this._context)) as TContext,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
      errorMessage: this._errorMessage,
    }
  }

  /** Restore in-memory state from a snapshot (does not auto-run). */
  public loadSnapshot(snapshot: PipelineSnapshot<TContext>): void {
    if (!snapshot || snapshot.version !== 1) {
      throw new ValidationError('Unsupported pipeline snapshot version')
    }
    if (snapshot.pipelineId !== this.id) {
      throw new ValidationError(
        `Snapshot pipelineId "${snapshot.pipelineId}" does not match "${this.id}"`,
      )
    }
    if (snapshot.steps.length !== this._stepDefs.length) {
      throw new ValidationError('Snapshot step count does not match pipeline definition')
    }

    this._status = snapshot.status
    this._currentStepIndex = snapshot.currentStepIndex
    this._steps = snapshot.steps.map((s) => ({ ...s }))
    this._context = { ...snapshot.context }
    this._createdAt = snapshot.createdAt
    this._updatedAt = snapshot.updatedAt
    this._errorMessage = snapshot.errorMessage
    this._cancelRequested = false
  }

  /** Persist current snapshot via the configured storage adapter. */
  public async checkpoint(): Promise<void> {
    if (!this._storage) return
    const json = JSON.stringify(this.getSnapshot())
    await this._storage.setItem(this._storageKey, json)
  }

  /** Load snapshot from storage if present. Returns true when loaded. */
  public async loadFromStorage(): Promise<boolean> {
    if (!this._storage) return false
    const raw = await this._storage.getItem(this._storageKey)
    if (!raw) return false
    const snapshot = JSON.parse(raw) as PipelineSnapshot<TContext>
    this.loadSnapshot(snapshot)
    return true
  }

  /** Clear checkpoint from storage. */
  public async clearCheckpoint(): Promise<void> {
    if (!this._storage?.removeItem) return
    await this._storage.removeItem(this._storageKey)
  }

  /**
   * Start the pipeline from the beginning (or from current index if already partially done).
   * Resets failed/cancelled pipelines to re-run pending/failed steps from current index.
   */
  public async start(): Promise<PipelineSnapshot<TContext>> {
    if (this._running) {
      throw new ValidationError('Pipeline is already running')
    }
    if (this._status === 'completed') {
      return this.getSnapshot()
    }

    this._cancelRequested = false
    // If fresh idle, ensure we start at 0
    if (this._status === 'idle') {
      this._currentStepIndex = 0
    }
    // failed/cancelled: resume from currentStepIndex (the failed step)
    return this._runFromCurrent('start')
  }

  /**
   * Resume from the exact failed (or paused) step index after interruption.
   * Loads storage checkpoint first when available and not already loaded.
   */
  public async resume(): Promise<PipelineSnapshot<TContext>> {
    if (this._running) {
      throw new ValidationError('Pipeline is already running')
    }

    // Prefer storage checkpoint when pipeline is still idle in-memory
    if (this._status === 'idle' && this._storage) {
      await this.loadFromStorage()
    }

    if (this._status === 'completed') {
      return this.getSnapshot()
    }

    if (this._status === 'idle') {
      // Nothing to resume — start fresh
      return this.start()
    }

    this._cancelRequested = false

    // If last status was failed, re-run the failed step (same index)
    if (this._status === 'failed') {
      const step = this._steps[this._currentStepIndex]
      if (step) {
        step.status = 'pending'
        step.errorMessage = undefined
        step.finishedAt = undefined
      }
      this._errorMessage = undefined
    }

    this._emit('resumed')
    return this._runFromCurrent('resume')
  }

  /** Request cooperative cancellation between steps. */
  public cancel(): void {
    this._cancelRequested = true
    if (!this._running && this._status === 'running') {
      this._status = 'cancelled'
      this._touch()
      this._emit('cancelled')
    }
  }

  /** Reset pipeline to idle with all steps pending (keeps context unless cleared). */
  public reset(options?: { clearContext?: boolean; context?: TContext }): void {
    if (this._running) {
      throw new ValidationError('Cannot reset a running pipeline')
    }
    this._status = 'idle'
    this._currentStepIndex = 0
    this._errorMessage = undefined
    this._cancelRequested = false
    this._steps = this._stepDefs.map((s, index) => ({
      id: s.id,
      label: s.label,
      status: 'pending',
      index,
    }))
    if (options?.clearContext) {
      this._context = {} as TContext
    }
    if (options?.context) {
      this._context = { ...options.context }
    }
    this._touch()
    this._emit('stateChange')
  }

  private async _runFromCurrent(_reason: 'start' | 'resume'): Promise<PipelineSnapshot<TContext>> {
    this._running = true
    this._status = 'running'
    this._touch()
    this._emit('stateChange')
    await this._maybeCheckpoint()

    try {
      for (let i = this._currentStepIndex; i < this._stepDefs.length; i++) {
        this._currentStepIndex = i
        const def = this._stepDefs[i]
        const snap = this._steps[i]

        if (this._cancelRequested) {
          this._status = 'cancelled'
          this._touch()
          this._emit('cancelled')
          await this._maybeCheckpoint()
          return this.getSnapshot()
        }

        // Skip already succeeded steps (resume mid-pipeline)
        if (snap.status === 'succeeded' || snap.status === 'skipped') {
          continue
        }

        // Optional when() predicate
        if (def.when) {
          const shouldRun = await def.when(this._context)
          if (!shouldRun) {
            snap.status = 'skipped'
            snap.finishedAt = new Date().toISOString()
            this._touch()
            this._emit('stepSkip', snap)
            this._emit('stateChange', snap)
            await this._maybeCheckpoint()
            continue
          }
        }

        snap.status = 'running'
        snap.startedAt = new Date().toISOString()
        snap.errorMessage = undefined
        this._touch()
        this._emit('stepStart', snap)
        this._emit('stateChange', snap)

        const helpers: StepHelpers<TContext> = {
          updateContext: (partial) => {
            this._context = { ...this._context, ...partial }
          },
          getContext: () => this._context,
          throwIfCancelled: () => {
            if (this._cancelRequested) {
              const err = new Error('Pipeline cancelled')
              ;(err as any).code = 'PIPELINE_CANCELLED'
              throw err
            }
          },
        }

        try {
          const result = (await def.run(this._context, helpers)) as StepResult | void
          snap.status = 'succeeded'
          snap.finishedAt = new Date().toISOString()
          if (result?.transactionHash) {
            snap.transactionHash = result.transactionHash
          }
          if (result?.meta) {
            snap.meta = { ...result.meta }
          }
          this._touch()
          this._emit('stepSuccess', snap)
          this._emit('stateChange', snap)
          await this._maybeCheckpoint()
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          snap.status = 'failed'
          snap.errorMessage = message
          snap.finishedAt = new Date().toISOString()
          this._status = 'failed'
          this._errorMessage = message
          this._touch()
          this._emit('stepFail', snap, err)
          this._emit('failed', snap, err)
          this._emit('stateChange', snap)
          await this._maybeCheckpoint()
          return this.getSnapshot()
        }
      }

      this._status = 'completed'
      this._touch()
      this._emit('completed')
      this._emit('stateChange')
      await this._maybeCheckpoint()
      return this.getSnapshot()
    } finally {
      this._running = false
    }
  }

  private _touch(): void {
    this._updatedAt = new Date().toISOString()
  }

  private async _maybeCheckpoint(): Promise<void> {
    if (this._autoCheckpoint) {
      await this.checkpoint()
    }
  }

  private _emit(
    type: PipelineEvent<TContext>['type'],
    step?: StepSnapshot,
    error?: unknown,
  ): void {
    const event: PipelineEvent<TContext> = {
      type,
      status: this._status,
      currentStepIndex: this._currentStepIndex,
      step: step ? { ...step } : undefined,
      snapshot: this.getSnapshot(),
      error,
    }
    for (const listener of this._listeners) {
      try {
        listener(event)
      } catch {
        // Listener errors must not break the pipeline
      }
    }
  }
}

export function createTransactionPipeline<
  TContext extends Record<string, unknown> = Record<string, unknown>,
>(options: TransactionPipelineOptions<TContext>): TransactionPipeline<TContext> {
  return new TransactionPipeline(options)
}

export { createMemoryStorage, createLocalStorageAdapter } from './states.js'
