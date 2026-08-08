/**
 * Exponential backoff + full-jitter retry helpers for JSON-RPC / HTTP transports.
 *
 * Used by RpcProvider (and available to app code) to absorb transient node hiccups
 * without hammering recovering endpoints.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts after the first try (default: 3). */
  maxRetries?: number
  /** Initial delay in ms before the first retry (default: 500). */
  initialDelayMs?: number
  /** Hard cap on delay in ms (default: 5000). */
  maxDelayMs?: number
  /** Exponential base multiplier (default: 2). */
  backoffMultiplier?: number
  /**
   * Jitter mode:
   * - `full` (default): delay = random(0, cappedExponential)
   * - `equal`: delay = half + random(0, half)  (AWS "equal jitter")
   * - `none`: pure exponential, no randomness
   */
  jitter?: 'full' | 'equal' | 'none'
  /** Optional abort signal to cancel waits / stop retrying. */
  signal?: AbortSignal
  /** Called before each retry sleep. */
  onRetry?: (info: RetryAttemptInfo) => void
  /** Override sleep (tests). */
  sleepFn?: (ms: number) => Promise<void>
  /** Override random 0..1 (tests). */
  randomFn?: () => number
}

export interface RetryAttemptInfo {
  attempt: number
  delayMs: number
  error: unknown
}

export class RetryExhaustedError extends Error {
  readonly attempts: number
  readonly lastError: unknown

  constructor(message: string, attempts: number, lastError: unknown) {
    super(message)
    this.name = 'RetryExhaustedError'
    this.attempts = attempts
    this.lastError = lastError
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Compute the delay for a given retry attempt index (0-based).
 * attempt 0 → ~initialDelay, attempt 1 → ~initial*multiplier, etc., capped at maxDelay.
 */
export function computeBackoffDelay(
  attempt: number,
  options: Pick<
    RetryOptions,
    'initialDelayMs' | 'maxDelayMs' | 'backoffMultiplier' | 'jitter' | 'randomFn'
  > = {},
): number {
  const initialDelayMs = options.initialDelayMs ?? 500
  const maxDelayMs = options.maxDelayMs ?? 5000
  const backoffMultiplier = options.backoffMultiplier ?? 2
  const jitter = options.jitter ?? 'full'
  const randomFn = options.randomFn ?? Math.random

  const exp = Math.min(
    maxDelayMs,
    initialDelayMs * Math.pow(backoffMultiplier, Math.max(0, attempt)),
  )

  if (jitter === 'none') {
    return Math.round(exp)
  }

  if (jitter === 'equal') {
    const half = exp / 2
    return Math.round(half + randomFn() * half)
  }

  // full jitter
  return Math.round(randomFn() * exp)
}

/**
 * Classify errors / HTTP statuses that are safe to retry.
 * Non-retryable: client errors (except 429), JSON-RPC method/signature errors, reverts.
 */
export function isRetryableError(error: unknown): boolean {
  if (error == null) return false

  if (typeof error === 'object') {
    const e = error as {
      status?: number
      statusCode?: number
      code?: string | number
      message?: string
      name?: string
      retryable?: boolean
    }

    if (e.retryable === true) return true
    if (e.retryable === false) return false

    const status = e.status ?? e.statusCode
    if (typeof status === 'number') {
      if (status === 429) return true
      if (status === 408) return true
      if (status >= 500 && status <= 599) return true
      // 4xx other than 429/408: not retryable
      if (status >= 400 && status < 500) return false
    }

    const msg = (e.message ?? '').toLowerCase()
    if (
      msg.includes('timeout') ||
      msg.includes('etimedout') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('network') ||
      msg.includes('socket hang up') ||
      msg.includes('fetch failed') ||
      msg.includes('rate limit') ||
      msg.includes('too many requests') ||
      msg.includes('503') ||
      msg.includes('502') ||
      msg.includes('504')
    ) {
      return true
    }

    // Unrecoverable JSON-RPC / contract errors
    if (
      msg.includes('execution reverted') ||
      msg.includes('invalid method') ||
      msg.includes('method not found') ||
      msg.includes('invalid signature') ||
      msg.includes('nonce too low') ||
      msg.includes('already known') ||
      msg.includes('insufficient funds')
    ) {
      return false
    }

    // Node system error codes
    if (typeof e.code === 'string') {
      const code = e.code.toUpperCase()
      if (
        code === 'ECONNRESET' ||
        code === 'ETIMEDOUT' ||
        code === 'ECONNREFUSED' ||
        code === 'EAI_AGAIN' ||
        code === 'EPIPE' ||
        code === 'ENOTFOUND'
      ) {
        return true
      }
    }
  }

  return false
}

/**
 * Returns true for HTTP status codes that should trigger a retry.
 */
export function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || status === 408 || (status >= 500 && status <= 599)
}

/**
 * Execute `fn` with exponential backoff + jitter on retryable failures.
 *
 * @example
 * const result = await withRetry(() => fetch(url), { maxRetries: 3, initialDelayMs: 500 })
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3
  const sleepFn = options.sleepFn ?? defaultSleep
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (options.signal?.aborted) {
      throw options.signal.reason instanceof Error
        ? options.signal.reason
        : new Error('Retry aborted')
    }

    try {
      return await fn(attempt)
    } catch (err) {
      lastError = err

      // Non-retryable: surface immediately.
      if (!isRetryableError(err)) {
        throw err
      }

      // Retryable but no attempts left.
      if (attempt >= maxRetries) {
        throw new RetryExhaustedError(
          `Retry exhausted after ${maxRetries} retries`,
          maxRetries + 1,
          lastError,
        )
      }

      const delayMs = computeBackoffDelay(attempt, options)
      options.onRetry?.({ attempt: attempt + 1, delayMs, error: err })
      await sleepFn(delayMs)
    }
  }

  throw new RetryExhaustedError(
    `Retry exhausted after ${maxRetries} retries`,
    maxRetries + 1,
    lastError,
  )
}
