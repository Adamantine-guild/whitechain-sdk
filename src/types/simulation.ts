import type { Address } from 'viem';

export interface TransferEvent {
  from: Address;
  to: Address;
  value: bigint;
  token: Address;
}

export interface SimulationResult {
  status: 'success' | 'revert';
  expectedTransfers: TransferEvent[];
  gasUsed: bigint;
  errorReason?: string;
  rawData?: any;
}

export interface StateOverrides {
  [address: string]: {
    balance?: bigint;
    nonce?: number;
    code?: string;
    state?: {
      [slot: string]: string;
    };
  };
}

export interface SimulationOptions {
  stateOverrides?: StateOverrides;
}
