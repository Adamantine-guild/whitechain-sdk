/**
 * Web Worker script for offloading Groth16 proof generation off the main thread.
 *
 * This module is inlined as a string and spawned as a Blob URL worker by Prover.ts,
 * which makes it portable — no bundler configuration or separate worker file needed.
 *
 * Message protocol:
 *   IN:  { wasmBuffer: ArrayBuffer, zkeyBuffer: ArrayBuffer, input: Record<string, unknown> }
 *   OUT: { proof: Groth16Proof, publicSignals: string[] }  (success)
 *   OUT: { error: string }                                 (failure)
 */

/**
 * The inline Web Worker source code as a string.
 * snarkjs is dynamically imported inside the worker so that:
 *  1. Non-ZK users who never call prove() are never charged the snarkjs load cost.
 *  2. The worker can be hosted as a blob URL without a build step.
 */
export const WORKER_SOURCE = /* js */ `
self.onmessage = async function(event) {
  const { wasmBuffer, zkeyBuffer, input } = event.data;

  try {
    // Dynamic import — snarkjs must be installed as a peer dependency
    let snarkjs;
    try {
      snarkjs = await import('snarkjs');
    } catch {
      throw new Error(
        'snarkjs is not installed. Run: npm install snarkjs\\n' +
        'snarkjs is an optional peer dependency required only for ZK proof generation.'
      );
    }

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      new Uint8Array(wasmBuffer),
      new Uint8Array(zkeyBuffer)
    );

    self.postMessage({ proof, publicSignals });
  } catch (err) {
    self.postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
};
`

/**
 * Creates a short-lived Blob URL for the worker source.
 * The caller is responsible for calling URL.revokeObjectURL() after the worker terminates.
 */
export function createWorkerBlobUrl(): string {
  const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' })
  return URL.createObjectURL(blob)
}
