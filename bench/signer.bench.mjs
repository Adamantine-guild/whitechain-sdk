// Node.js benchmark: JS (@noble/curves) signer vs WASM (tiny-secp256k1) signer.
//
// Run with `npm run bench` after `npm run build` (or a partial ESM build --
// see README). Imports the compiled output directly, mirroring how
// tests/tree-shaking.test.ts already consumes dist/esm.
import { jsBackend } from '../dist/esm/crypto/backends/js.js'
import { createWasmBackend } from '../dist/esm/crypto/backends/wasm.js'

const WARMUP_ITERATIONS = 2_000
const ROUNDS = 7
const ITERATIONS_PER_ROUND = 20_000
const REQUIRED_SPEEDUP = 5

const PRIVATE_KEY = Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 1 : 0))
const HASH = Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + 1) % 256)

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function timeRound(fn, iterations) {
  const start = process.hrtime.bigint()
  for (let i = 0; i < iterations; i++) fn()
  const end = process.hrtime.bigint()
  return Number(end - start) / 1e6 // milliseconds
}

function benchmarkSign(backend) {
  const sign = () => backend.sign(HASH, PRIVATE_KEY)

  // Warm up: excluded from steady-state timing. For the WASM backend this
  // also absorbs one-time module/JIT costs unrelated to per-call throughput.
  for (let i = 0; i < WARMUP_ITERATIONS; i++) sign()

  const roundMs = []
  for (let r = 0; r < ROUNDS; r++) {
    roundMs.push(timeRound(sign, ITERATIONS_PER_ROUND))
  }

  const medianMs = median(roundMs)
  const opsPerSec = ITERATIONS_PER_ROUND / (medianMs / 1000)
  return { roundMs, medianMs, opsPerSec }
}

async function main() {
  console.log(`Node ${process.version}, ${ROUNDS} rounds x ${ITERATIONS_PER_ROUND} sign() calls, ${WARMUP_ITERATIONS} warmup calls each\n`)

  // Load the WASM backend once, up front, and exclude that cost from
  // steady-state timing -- this benchmark measures per-call throughput,
  // not cold-start latency.
  const wasmModule = await import('tiny-secp256k1')
  const wasmBackend = createWasmBackend(wasmModule)

  const js = benchmarkSign(jsBackend)
  const wasm = benchmarkSign(wasmBackend)

  const speedup = js.medianMs / wasm.medianMs

  console.log('JS   (@noble/curves): median %s ms, %s ops/sec', js.medianMs.toFixed(2), Math.round(js.opsPerSec).toLocaleString())
  console.log('WASM (tiny-secp256k1): median %s ms, %s ops/sec', wasm.medianMs.toFixed(2), Math.round(wasm.opsPerSec).toLocaleString())
  console.log(`\nSpeedup (JS median / WASM median): ${speedup.toFixed(2)}x`)

  if (speedup >= REQUIRED_SPEEDUP) {
    console.log(`MEETS the ${REQUIRED_SPEEDUP}x requirement (${speedup.toFixed(2)}x >= ${REQUIRED_SPEEDUP}x).`)
  } else {
    console.log(`DOES NOT MEET the ${REQUIRED_SPEEDUP}x requirement (${speedup.toFixed(2)}x < ${REQUIRED_SPEEDUP}x).`)
  }
}

main()
