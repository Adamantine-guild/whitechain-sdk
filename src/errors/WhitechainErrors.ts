import { WhiteChainError } from './BaseError.js';

/**
 * Base class for all typed SDK errors.
 */
export class SDKError extends WhiteChainError {
  constructor(message: string) {
    super(message);
    this.name = 'SDKError';
  }
}

/**
 * Thrown when a transaction is reverted but the revert reason or custom error
 * cannot be explicitly mapped to a specific typed error.
 */
export class TransactionRevertedError extends SDKError {
  public readonly reason?: string;
  public readonly args?: readonly unknown[];

  constructor(message: string, reason?: string, args?: readonly unknown[]) {
    super(message);
    this.name = 'TransactionRevertedError';
    this.reason = reason;
    this.args = args;
  }
}

/**
 * Fallback for unparseable or unknown transaction errors.
 */
export class UnknownTransactionError extends SDKError {
  public readonly originalError: unknown;

  constructor(message: string, originalError: unknown) {
    super(message);
    this.name = 'UnknownTransactionError';
    this.originalError = originalError;
  }
}

/**
 * Thrown when a user does not have enough balance to perform the action.
 */
export class InsufficientBalanceError extends TransactionRevertedError {
  constructor(args?: readonly unknown[]) {
    super('Insufficient balance for the transaction.', 'InsufficientBalance', args);
    this.name = 'InsufficientBalanceError';
  }
}

/**
 * Thrown when a user is not authorized to perform the action.
 */
export class UnauthorizedError extends TransactionRevertedError {
  constructor(args?: readonly unknown[]) {
    super('Not authorized to perform this action.', 'Unauthorized', args);
    this.name = 'UnauthorizedError';
  }
}
