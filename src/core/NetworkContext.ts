import type { PublicClient, WalletClient, Address } from 'viem';

export interface NetworkState {
  chainId?: number;
  publicClient: PublicClient;
  walletClient?: WalletClient;
  addresses: Record<string, Address>;
}

export interface NetworkObserver {
  onNetworkChanged(state: NetworkState): void;
}

export class NetworkContext {
  private observers: Set<NetworkObserver> = new Set();
  private state: NetworkState;

  constructor(initialState: NetworkState) {
    this.state = initialState;
  }

  subscribe(observer: NetworkObserver) {
    this.observers.add(observer);
    // Immediately notify the new observer of the current state
    observer.onNetworkChanged(this.state);
  }

  unsubscribe(observer: NetworkObserver) {
    this.observers.delete(observer);
  }

  setNetwork(newState: NetworkState) {
    this.state = newState;
    for (const observer of this.observers) {
      observer.onNetworkChanged(this.state);
    }
  }

  getState(): NetworkState {
    return this.state;
  }
}
