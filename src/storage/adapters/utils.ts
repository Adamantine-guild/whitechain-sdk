import { RpcError } from '../../errors/index.js'

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let attempt = 0
  let delay = 1000 // 1 second initial backoff

  while (attempt <= maxRetries) {
    try {
      const response = await fetch(url, options)

      // 429 Too Many Requests -> rate limit
      if (response.status === 429 && attempt < maxRetries) {
        attempt++
        await new Promise(r => setTimeout(r, delay))
        delay *= 2 // Exponential backoff
        continue
      }

      if (!response.ok) {
        let body
        try {
          body = await response.json()
        } catch {
          body = await response.text()
        }
        throw new RpcError(`HTTP Error: ${response.status} ${response.statusText}`, response.status, body)
      }

      return response
    } catch (err) {
      if (err instanceof RpcError) throw err
      if (attempt >= maxRetries) throw err

      attempt++
      await new Promise(r => setTimeout(r, delay))
      delay *= 2
    }
  }

  throw new Error('Unreachable')
}
