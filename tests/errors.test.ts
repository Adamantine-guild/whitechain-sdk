import { describe, it, expect } from 'vitest'
import {
  WhiteChainError,
  RpcError,
  ValidationError,
  TimeoutError,
  ContractRevertError,
  TransactionRevertedError,
} from '../src/index.js'

describe('Error classes', () => {
  describe('WhiteChainError (base)', () => {
    it('is an instance of Error and WhiteChainError', () => {
      const err = new WhiteChainError('base error')
      expect(err).toBeInstanceOf(Error)
      expect(err).toBeInstanceOf(WhiteChainError)
      expect(err.message).toBe('base error')
    })

    it('sets the name to the class name', () => {
      const err = new WhiteChainError('test')
      expect(err.name).toBe('WhiteChainError')
    })

    it('preserves the stack trace', () => {
      const err = new WhiteChainError('stack test')
      expect(err.stack).toBeDefined()
      expect(err.stack).toContain('WhiteChainError')
    })
  })

  describe('RpcError', () => {
    it('is instanceof Error, WhiteChainError, and RpcError', () => {
      const err = new RpcError('rpc failed', 500, { reason: 'internal' })
      expect(err).toBeInstanceOf(Error)
      expect(err).toBeInstanceOf(WhiteChainError)
      expect(err).toBeInstanceOf(RpcError)
    })

    it('stores status and responseBody metadata', () => {
      const body = { error: 'not found' }
      const err = new RpcError('not found', 404, body)
      expect(err.message).toBe('not found')
      expect(err.status).toBe(404)
      expect(err.responseBody).toBe(body)
    })

    it('works without optional metadata', () => {
      const err = new RpcError('timeout')
      expect(err.status).toBeUndefined()
      expect(err.responseBody).toBeUndefined()
    })

    it('sets the name to RpcError', () => {
      const err = new RpcError('test')
      expect(err.name).toBe('RpcError')
    })

    it('can be used in instanceof checks in catch blocks', () => {
      function throwRpc() { throw new RpcError('rpc error', 503) }
      
      try {
        throwRpc()
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e instanceof RpcError).toBe(true)
        expect(e instanceof WhiteChainError).toBe(true)
        if (e instanceof RpcError) {
          expect(e.status).toBe(503)
        }
      }
    })
  })

  describe('ValidationError', () => {
    it('is instanceof Error, WhiteChainError, and ValidationError', () => {
      const err = new ValidationError('invalid argument')
      expect(err).toBeInstanceOf(Error)
      expect(err).toBeInstanceOf(WhiteChainError)
      expect(err).toBeInstanceOf(ValidationError)
    })

    it('sets the correct name', () => {
      const err = new ValidationError('test')
      expect(err.name).toBe('ValidationError')
    })

    it('can be caught with instanceof in catch blocks', () => {
      function throwValidation() { throw new ValidationError('bad input') }

      try {
        throwValidation()
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e instanceof ValidationError).toBe(true)
        expect(e instanceof RpcError).toBe(false)
      }
    })
  })

  describe('TimeoutError', () => {
    it('is instanceof Error, WhiteChainError, and TimeoutError', () => {
      const err = new TimeoutError('request timed out')
      expect(err).toBeInstanceOf(Error)
      expect(err).toBeInstanceOf(WhiteChainError)
      expect(err).toBeInstanceOf(TimeoutError)
    })

    it('sets the correct name', () => {
      const err = new TimeoutError('test')
      expect(err.name).toBe('TimeoutError')
    })

    it('can be distinguished from other errors', () => {
      function throwTimeout() { throw new TimeoutError('too slow') }

      try {
        throwTimeout()
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e instanceof TimeoutError).toBe(true)
        expect(e instanceof RpcError).toBe(false)
        expect(e instanceof ValidationError).toBe(false)
      }
    })
  })

  describe('ContractRevertError', () => {
    it('is instanceof WhiteChainError and TransactionRevertedError', () => {
      const err = new ContractRevertError({
        message: 'execution reverted: Unauthorized',
        reason: 'Unauthorized',
        rawData: '0x1234',
        rpcCode: -32000,
        customErrorName: 'Unauthorized',
      })

      expect(err).toBeInstanceOf(Error)
      expect(err).toBeInstanceOf(WhiteChainError)
      expect(err).toBeInstanceOf(TransactionRevertedError)
      expect(err).toBeInstanceOf(ContractRevertError)
      expect(err.reason).toBe('Unauthorized')
      expect(err.rawData).toBe('0x1234')
      expect(err.rpcCode).toBe(-32000)
      expect(err.customErrorName).toBe('Unauthorized')
    })
  })

  describe('instanceof discrimination across all types', () => {
    const errors = [
      new RpcError('rpc'),
      new ValidationError('validation'),
      new TimeoutError('timeout'),
      new ContractRevertError({ message: 'revert' }),
    ]

    it('RpcError is only instanceof RpcError (not TimeoutError/ValidationError)', () => {
      expect(errors[0] instanceof RpcError).toBe(true)
      expect(errors[0] instanceof ValidationError).toBe(false)
      expect(errors[0] instanceof TimeoutError).toBe(false)
    })

    it('ValidationError is only instanceof ValidationError', () => {
      expect(errors[1] instanceof ValidationError).toBe(true)
      expect(errors[1] instanceof RpcError).toBe(false)
      expect(errors[1] instanceof TimeoutError).toBe(false)
    })

    it('TimeoutError is only instanceof TimeoutError', () => {
      expect(errors[2] instanceof TimeoutError).toBe(true)
      expect(errors[2] instanceof RpcError).toBe(false)
      expect(errors[2] instanceof ValidationError).toBe(false)
    })

    it('all are instanceof WhiteChainError', () => {
      for (const err of errors) {
        expect(err instanceof WhiteChainError).toBe(true)
      }
    })
  })
})
