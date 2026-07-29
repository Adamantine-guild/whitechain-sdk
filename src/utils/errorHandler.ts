import { decodeErrorResult, BaseError, type Abi } from 'viem';
import {
  InsufficientBalanceError,
  UnauthorizedError,
  TransactionRevertedError,
  UnknownTransactionError
} from '../errors/WhitechainErrors.js';

export function parseContractError(error: unknown, abi?: Abi): Error {
  if (!(error instanceof Error)) {
    return new UnknownTransactionError('An unknown error occurred.', error);
  }

  // Attempt to extract revert data from typical viem/ethers error structures
  let revertData: `0x${string}` | undefined;
  
  if (error instanceof BaseError) {
    // Viem error: walk down the error chain to find the RPC error with data
    const cause = error.walk() as any;
    revertData = cause?.data || cause?.error?.data || cause?.cause?.data;
  } else {
    // Ethers / Generic RPC error
    revertData = (error as any).data || (error as any).error?.data;
  }

  if (revertData && typeof revertData === 'string' && revertData.startsWith('0x') && abi) {
    try {
      const decoded = decodeErrorResult({ abi, data: revertData });
      
      switch (decoded.errorName) {
        case 'InsufficientBalance':
          return new InsufficientBalanceError(decoded.args);
        case 'Unauthorized':
          return new UnauthorizedError(decoded.args);
        default:
          return new TransactionRevertedError(
            `Transaction reverted: ${decoded.errorName}`,
            decoded.errorName,
            decoded.args
          );
      }
    } catch (decodeErr) {
      // Decode failed, maybe ABI didn't contain this error
      return new TransactionRevertedError(`Transaction reverted with data: ${revertData}`, revertData);
    }
  }

  // If we can't extract revert data or ABI is missing, return a generic transaction error
  return new UnknownTransactionError(error.message, error);
}
