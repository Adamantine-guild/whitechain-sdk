export interface Multicall3Call<T = any> {
  /**
   * The target contract address to execute the view call against.
   */
  target: string;

  /**
   * The encoded ABI calldata (0x...) for the target view function.
   */
  callData: `0x${string}`;

  /**
   * If true, failure of this individual call will not revert the entire multicall.
   * @default true
   */
  allowFailure?: boolean;

  /**
   * Optional custom decoding function to transform raw return bytes into typed values.
   */
  decoder?: (returnData: `0x${string}`) => T;
}

export interface Multicall3CallResult<T = any> {
  /**
   * True if the call succeeded without reverting.
   */
  success: boolean;

  /**
   * The raw hex bytes returned by the target function.
   */
  returnData: `0x${string}`;

  /**
   * The decoded value returned by the decoder function, if provided and successful.
   */
  value?: T;

  /**
   * Error message if the call failed or reverted.
   */
  error?: string;
}

export interface Multicall3Options {
  /**
   * Configurable Multicall3 contract address.
   * Defaults to official Whitechain Multicall3 deployment (0xcA11bde05977b3631167028862bE2a173976CA11).
   */
  multicallAddress?: string;

  /**
   * Block number or tag to execute the call against.
   * @default "latest"
   */
  blockNumber?: number | bigint | string;

  /**
   * Global default for allowFailure across all calls in the batch.
   * @default true
   */
  allowFailure?: boolean;
}
