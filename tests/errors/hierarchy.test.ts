import { describe, it, expect } from 'vitest'
import {
  WhiteChainError,
  WhitechainSDKError,
  SdkErrorCode,
  SDKError,
  WalletSignerError,
  TransactionExecutionError,
  RPCNodeError,
  InsufficientBalanceError,
  ContractRevertError,
  TransactionRevertedError,
  ValidationError,
  TimeoutError,
  RpcError,
} from '../../src/errors/index.js'
import {
  decodeError,
  extractRevertReason,
  isUserRejection,
  ensureSdkError,
} from '../../src/utils/errorDecoder.js'

describe('WhitechainSDKError hierarchy', () => {
  it('roots share a common base for instanceof checks', () => {
    const base = new WhitechainSDKError('boom', { code: SdkErrorCode.UNKNOWN })
    expect(base).toBeInstanceOf(Error)
    expect(base).toBeInstanceOf(WhiteChainError)
    expect(base).toBeInstanceOf(WhitechainSDKError)
    expect(base.code).toBe(SdkErrorCode.UNKNOWN)
    expect(base.stack).toBeDefined()
  })

  it('WalletSignerError is catchable via instanceof and marks user rejection', () => {
    const err = new WalletSignerError('User rejected the request', { userRejected: true })
    expect(err).toBeInstanceOf(WalletSignerError)
    expect(err).toBeInstanceOf(SDKError)
    expect(err).toBeInstanceOf(WhiteChainError)
    expect(err.code).toBe(SdkErrorCode.WALLET_SIGNER)
    expect(err.userRejected).toBe(true)
    expect(err.name).toBe('WalletSignerError')
  })

  it('TransactionExecutionError carries diagnostic metadata', () => {
    const err = new TransactionExecutionError('tx failed', {
      transactionHash: '0xabc',
      contractAddress: '0xdead',
      revertReason: 'Paused',
    })
    expect(err).toBeInstanceOf(TransactionExecutionError)
    expect(err.code).toBe(SdkErrorCode.TRANSACTION_EXECUTION)
    expect(err.transactionHash).toBe('0xabc')
    expect(err.contractAddress).toBe('0xdead')
    expect(err.revertReason).toBe('Paused')
    expect(err.context.transactionHash).toBe('0xabc')
  })

  it('RPCNodeError stores status and method', () => {
    const err = new RPCNodeError('Service Unavailable', {
      status: 503,
      method: 'eth_call',
      rpcCode: -32000,
    })
    expect(err).toBeInstanceOf(RPCNodeError)
    expect(err.code).toBe(SdkErrorCode.RPC_NODE)
    expect(err.status).toBe(503)
    expect(err.method).toBe('eth_call')
  })

  it('InsufficientBalanceError has a dedicated code and remains a TransactionRevertedError', () => {
    const err = new InsufficientBalanceError()
    expect(err).toBeInstanceOf(InsufficientBalanceError)
    expect(err).toBeInstanceOf(TransactionRevertedError)
    expect(err).toBeInstanceOf(TransactionExecutionError)
    expect(err.code).toBe(SdkErrorCode.INSUFFICIENT_BALANCE)
    expect(err.reason).toBe('InsufficientBalance')
  })

  it('ValidationError and TimeoutError include explicit codes', () => {
    expect(new ValidationError('bad').code).toBe(SdkErrorCode.VALIDATION)
    expect(new TimeoutError('slow').code).toBe(SdkErrorCode.TIMEOUT)
    expect(new RpcError('rpc', 500).code).toBe(SdkErrorCode.RPC_NODE)
  })

  it('preserves stack traces across wrapping', () => {
    const original = new Error('root cause')
    const wrapped = new WalletSignerError('wrap', { cause: original })
    expect(wrapped.stack).toBeDefined()
    expect(wrapped.stack).toContain('root cause')
    expect(wrapped.cause).toBe(original)
  })

  it('toJSON exposes code and context', () => {
    const err = new RPCNodeError('down', { status: 502, method: 'eth_blockNumber' })
    const json = err.toJSON()
    expect(json.code).toBe(SdkErrorCode.RPC_NODE)
    expect(json.context).toMatchObject({ status: 502, method: 'eth_blockNumber' })
  })
})

describe('decodeError / errorDecoder', () => {
  it('maps user rejection strings to WalletSignerError', () => {
    const err = decodeError(new Error('User denied transaction signature'))
    expect(err).toBeInstanceOf(WalletSignerError)
    expect(isUserRejection(err)).toBe(true)
  })

  it('maps MetaMask 4001 codes', () => {
    const raw = Object.assign(new Error('Rejected'), { code: 4001 })
    expect(decodeError(raw)).toBeInstanceOf(WalletSignerError)
    expect(isUserRejection(raw)).toBe(true)
  })

  it('maps execution reverted to ContractRevertError with reason', () => {
    const err = decodeError(new Error('execution reverted: CustomPaused'))
    expect(err).toBeInstanceOf(ContractRevertError)
    expect(extractRevertReason(err)).toBe('CustomPaused')
  })

  it('maps execution reverted insufficient balance to InsufficientBalanceError', () => {
    const err = decodeError(new Error('execution reverted: Insufficient balance'))
    expect(err).toBeInstanceOf(InsufficientBalanceError)
  })

  it('maps network failures to RPCNodeError', () => {
    const err = decodeError(Object.assign(new Error('fetch failed'), { status: 503 }))
    expect(err).toBeInstanceOf(RPCNodeError)
    expect((err as RPCNodeError).status).toBe(503)
  })

  it('maps insufficient funds text', () => {
    const err = decodeError(new Error('insufficient funds for gas * price + value'))
    expect(err).toBeInstanceOf(InsufficientBalanceError)
  })

  it('maps timeouts', () => {
    const err = decodeError(new Error('request timed out'))
    expect(err).toBeInstanceOf(TimeoutError)
    expect(err.code).toBe(SdkErrorCode.TIMEOUT)
  })

  it('attaches extras (tx hash, contract) for transaction failures', () => {
    const err = decodeError(new Error('failed'), {
      transactionHash: '0xhash',
      contractAddress: '0xca',
    })
    expect(err).toBeInstanceOf(TransactionExecutionError)
    expect((err as TransactionExecutionError).transactionHash).toBe('0xhash')
  })

  it('passes through existing WhiteChainError instances', () => {
    const original = new ValidationError('nope')
    expect(decodeError(original)).toBe(original)
  })

  it('ensureSdkError upgrades RpcError to RPCNodeError', () => {
    const upgraded = ensureSdkError(new RpcError('bad gateway', 502, { a: 1 }))
    expect(upgraded).toBeInstanceOf(RPCNodeError)
    expect((upgraded as RPCNodeError).status).toBe(502)
  })

  it('utils path exports work for user rejection detection', () => {
    expect(decodeError(new Error('user rejected'))).toBeInstanceOf(WalletSignerError)
    expect(isUserRejection(new Error('user rejected'))).toBe(true)
  })
})
