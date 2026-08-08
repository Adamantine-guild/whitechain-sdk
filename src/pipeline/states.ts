/**
 * Finite-state machine types for multi-step transaction pipelines.
 * All structures are JSON-serializable for checkpoint persistence.
 */

/** High-level pipeline lifecycle status. */
export type PipelineStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

/** Per-step execution status. */
export type StepStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped'

export interface StepDefinition<TContext = Record<string, unknown>> {
  /** Stable machine id for this step (e.g. "approve", "deposit"). */
  id: string
  /** Human-readable label for UI. */
  label?: string
  /**
   * Execute the step. Return optional metadata (tx hash, receipts).
   * Throw / reject to mark the step (and pipeline) as failed.
   */
  run: (ctx: TContext, helpers: StepHelpers<TContext>) => Promise<StepResult | void>
  /**
   * Optional predicate — when false, step is skipped without calling `run`.
   */
  when?: (ctx: TContext) => boolean | Promise<boolean>
}

export interface StepHelpers<TContext = Record<string, unknown>> {
  /** Merge partial context updates (e.g. approval tx hash). */
  updateContext: (partial: Partial<TContext>) => void
  /** Read-only snapshot of context. */
  getContext: () => Readonly<TContext>
  /** Signal cooperative cancellation (throws if cancel requested). */
  throwIfCancelled: () => void
}

export interface StepResult {
  /** Primary transaction hash for this step, if any. */
  transactionHash?: string
  /** Free-form step metadata (must be JSON-serializable if checkpointing). */
  meta?: Record<string, unknown>
}

export interface StepSnapshot {
  id: string
  label?: string
  status: StepStatus
  index: number
  transactionHash?: string
  errorMessage?: string
  meta?: Record<string, unknown>
  startedAt?: string
  finishedAt?: string
}

export interface PipelineSnapshot<TContext = Record<string, unknown>> {
  /** Schema version for future migrations. */
  version: 1
  pipelineId: string
  status: PipelineStatus
  /** Index of the step currently running or next to resume. */
  currentStepIndex: number
  steps: StepSnapshot[]
  context: TContext
  createdAt: string
  updatedAt: string
  errorMessage?: string
}

export type PipelineEventType =
  | 'stateChange'
  | 'stepStart'
  | 'stepSuccess'
  | 'stepFail'
  | 'stepSkip'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'resumed'

export interface PipelineEvent<TContext = Record<string, unknown>> {
  type: PipelineEventType
  status: PipelineStatus
  currentStepIndex: number
  step?: StepSnapshot
  snapshot: PipelineSnapshot<TContext>
  error?: unknown
}

export type PipelineListener<TContext = Record<string, unknown>> = (
  event: PipelineEvent<TContext>,
) => void

/** Storage adapter for checkpoint persistence (localStorage, memory, …). */
export interface PipelineStorage {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem?(key: string): void | Promise<void>
}

export function createMemoryStorage(seed?: Record<string, string>): PipelineStorage {
  const map = new Map<string, string>(Object.entries(seed ?? {}))
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v)
    },
    removeItem: (k) => {
      map.delete(k)
    },
  }
}

/** Browser localStorage adapter (no-ops when localStorage is unavailable). */
export function createLocalStorageAdapter(
  storage?: Storage,
): PipelineStorage {
  const store =
    storage ??
    (typeof globalThis !== 'undefined' && (globalThis as any).localStorage
      ? (globalThis as any).localStorage
      : null)

  if (!store) {
    return createMemoryStorage()
  }

  return {
    getItem: (k) => store.getItem(k),
    setItem: (k, v) => {
      store.setItem(k, v)
    },
    removeItem: (k) => {
      store.removeItem(k)
    },
  }
}
