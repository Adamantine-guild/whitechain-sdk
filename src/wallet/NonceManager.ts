export class NonceManager {
  private nonces = new Map<string, number>()
  private pendingFetches = new Map<string, Promise<number>>()

  /**
   * Retrieves the next valid nonce for a given address.
   * If a nonce is already cached, it is atomically incremented synchronously.
   * Otherwise, it fetches the nonce via the provided `fetchFn`.
   */
  async getNonce(address: string, fetchFn: () => Promise<number>): Promise<number> {
    const normalizedAddress = address.toLowerCase()

    // 1. If we already have a cached nonce, we can synchronously reserve it
    // and increment our local counter to prevent collisions.
    const cached = this.nonces.get(normalizedAddress)
    if (cached !== undefined) {
      this.nonces.set(normalizedAddress, cached + 1)
      return cached
    }

    // 2. If a fetch is currently in progress, we await it, but we MUST
    // NOT simply return its result. Another async call might have raced us 
    // and consumed it. Instead, we recursively call getNonce once the
    // fetch is done, so we pick up the latest cached value synchronously.
    const pending = this.pendingFetches.get(normalizedAddress)
    if (pending) {
      await pending
      return this.getNonce(address, fetchFn)
    }

    // 3. Initiate a new fetch.
    const promise = fetchFn()
      .then((fetchedNonce) => {
        // Set the initial nonce cache. Waking awaiters will synchronously increment it.
        this.nonces.set(normalizedAddress, fetchedNonce)
        this.pendingFetches.delete(normalizedAddress)
        return fetchedNonce
      })
      .catch((err) => {
        this.pendingFetches.delete(normalizedAddress)
        throw err
      })

    this.pendingFetches.set(normalizedAddress, promise)
    await promise

    // 4. Return via step 1 logic to synchronously reserve and increment it.
    return this.getNonce(address, fetchFn)
  }

  /**
   * Resets the nonce cache for an address, forcing the next call to fetch via RPC.
   * Useful when a transaction drops or errors due to an incorrect nonce.
   */
  reset(address: string): void {
    const normalizedAddress = address.toLowerCase()
    this.nonces.delete(normalizedAddress)
  }
}
