import { type Address, type PublicClient, type Abi, decodeEventLog } from 'viem';
import { parseContractError } from '../utils/errorHandler.js';
import type { SimulationResult, SimulationOptions, TransferEvent, StateOverrides } from '../types/simulation.js';

const ERC20_TRANSFER_EVENT_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: false, name: 'value', type: 'uint256' },
    ],
    name: 'Transfer',
    type: 'event',
  }
] as const;

export class Simulator {
  constructor(private publicClient: PublicClient) {}

  /**
   * Simulates a transaction by first trying debug_traceCall to extract internal
   * state changes (like ERC20 transfers). If the node doesn't support tracing,
   * it falls back to a standard eth_call to at least check success/revert.
   */
  async simulateTransaction(
    tx: { to: Address; data: string; from?: Address; value?: bigint },
    abi?: Abi,
    options?: SimulationOptions
  ): Promise<SimulationResult> {
    const formattedTx = {
      to: tx.to,
      data: tx.data,
      ...(tx.from ? { from: tx.from } : {}),
      ...(tx.value ? { value: `0x${tx.value.toString(16)}` } : {}),
    };

    let formattedOverrides = undefined;
    if (options?.stateOverrides) {
      formattedOverrides = this.formatStateOverrides(options.stateOverrides);
    }

    try {
      // 1. Try debug_traceCall with callTracer
      const traceArgs: any[] = [formattedTx, 'latest', { tracer: 'callTracer' }];
      
      const rawTrace = await (this.publicClient as any).request({
        method: 'debug_traceCall',
        params: formattedOverrides ? [...traceArgs, formattedOverrides] : traceArgs
      });

      return this.parseTraceResult(rawTrace, abi);
    } catch (traceError: any) {
      // If debug_traceCall fails (e.g. method not supported), fallback to eth_call
      const isMethodNotSupported = traceError?.message?.toLowerCase().includes('not supported') ||
                                   traceError?.message?.toLowerCase().includes('does not exist');

      if (isMethodNotSupported) {
         try {
           const callArgs: any[] = [formattedTx, 'latest'];
           if (formattedOverrides) callArgs.push(formattedOverrides);
           
           await (this.publicClient as any).request({
             method: 'eth_call',
             params: callArgs
           });
           
           return {
             status: 'success',
             expectedTransfers: [],
             gasUsed: 0n, // cannot determine gas from eth_call
             rawData: { note: 'Fallback to eth_call used. No trace available.' }
           };
         } catch (callError: any) {
           return {
             status: 'revert',
             expectedTransfers: [],
             gasUsed: 0n,
             errorReason: abi ? parseContractError(callError, abi).message : callError.message,
             rawData: callError
           };
         }
      }

      // If it was a legitimate revert during trace (some nodes throw on revert during trace)
      return {
         status: 'revert',
         expectedTransfers: [],
         gasUsed: 0n,
         errorReason: abi ? parseContractError(traceError, abi).message : traceError.message,
         rawData: traceError
      };
    }
  }

  private parseTraceResult(trace: any, abi?: Abi): SimulationResult {
    // If the trace contains an error field at the top level
    if (trace.error) {
      let reason = trace.error;
      if (trace.revertReason) {
         reason = trace.revertReason;
      } else if (trace.output && trace.output !== '0x' && abi) {
         // Attempt to decode revert data if present
         try {
            const decoded = parseContractError({ data: trace.output }, abi);
            reason = decoded.message;
         } catch (e) {}
      }
      return {
        status: 'revert',
        expectedTransfers: [],
        gasUsed: BigInt(trace.gasUsed || 0),
        errorReason: reason,
        rawData: trace
      };
    }

    const expectedTransfers: TransferEvent[] = [];
    this.extractTransfers(trace, expectedTransfers);

    return {
      status: 'success',
      expectedTransfers,
      gasUsed: BigInt(trace.gasUsed || 0),
      rawData: trace
    };
  }

  private extractTransfers(callFrame: any, transfers: TransferEvent[]) {
    if (callFrame.logs && Array.isArray(callFrame.logs)) {
      for (const log of callFrame.logs) {
        // Try decoding as ERC20 Transfer
        try {
          const decoded = decodeEventLog({
            abi: ERC20_TRANSFER_EVENT_ABI,
            data: log.data,
            topics: log.topics,
          });

          if (decoded.eventName === 'Transfer') {
            transfers.push({
              from: (decoded.args as any).from,
              to: (decoded.args as any).to,
              value: (decoded.args as any).value,
              token: callFrame.to || log.address // callFrame.to in callTracer
            });
          }
        } catch (e) {
          // Not a transfer event or decoding failed, safely ignore
        }
      }
    }

    // Recursively check subcalls
    if (callFrame.calls && Array.isArray(callFrame.calls)) {
      for (const subcall of callFrame.calls) {
        this.extractTransfers(subcall, transfers);
      }
    }
  }

  private formatStateOverrides(overrides: StateOverrides): any {
    const formatted: any = {};
    for (const [address, override] of Object.entries(overrides)) {
      formatted[address] = {};
      if (override.balance !== undefined) {
        formatted[address].balance = `0x${override.balance.toString(16)}`;
      }
      if (override.nonce !== undefined) {
        formatted[address].nonce = `0x${override.nonce.toString(16)}`;
      }
      if (override.code !== undefined) {
        formatted[address].code = override.code;
      }
      if (override.state !== undefined) {
        formatted[address].stateDiff = override.state; // stateDiff is often used
      }
    }
    return formatted;
  }
}
