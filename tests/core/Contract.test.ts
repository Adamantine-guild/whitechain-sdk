import { describe, expect, it, vi } from 'vitest'
import { Contract } from '../../src/core/Contract.js'
import { WhiteChainError } from '../../src/types.js'

describe('Contract class and verify() opt-in check', () => {
  const dummyAddress = '0x1234567890123456789012345678901234567890'
  const dummyAbi: any[] = []

  it('throws WhiteChainError if initialized without an address', () => {
    expect(() => new Contract('' as any, dummyAbi, {} as any)).toThrow(WhiteChainError)
  });

  it('is an explicit opt-in check and does not call RPC upon instantiation', () => {
    const getCodeMock = vi.fn()
    const client = { getCode: getCodeMock }

    const contract = new Contract(dummyAddress, dummyAbi, client)
    expect(contract.address).toBe(dummyAddress)
    expect(getCodeMock).not.toHaveBeenCalled()
  });

  it('succeeds and returns the Contract instance when bytecode exists (non-0x)', async () => {
    const getCodeMock = vi.fn().mockResolvedValue('0x608060405260043610601157')
    const client = { getCode: getCodeMock }

    const contract = new Contract(dummyAddress, dummyAbi, client)
    const result = await contract.verify()

    expect(getCodeMock).toHaveBeenCalledWith({ address: dummyAddress })
    expect(result).toBe(contract)
  });

  it('throws WhiteChainError if bytecode is 0x (contract does not exist)', async () => {
    const getCodeMock = vi.fn().mockResolvedValue('0x')
    const client = { getCode: getCodeMock }

    const contract = new Contract(dummyAddress, dummyAbi, client)

    await expect(contract.verify()).rejects.toThrow(WhiteChainError)
    await expect(contract.verify()).rejects.toThrow("No contract code deployed at address 0x1234567890123456789012345678901234567890 (code is '0x')")
  });

  it('throws WhiteChainError if bytecode is 0x0 or empty', async () => {
    const getCodeMock = vi.fn().mockResolvedValue('0x0')
    const client = { getCode: getCodeMock }

    const contract = new Contract(dummyAddress, dummyAbi, client)

    await expect(contract.verify()).rejects.toThrow(WhiteChainError)
  });

  it('supports providers using request({ method: "eth_getCode", params: [...] })', async () => {
    const requestMock = vi.fn().mockResolvedValue('0x60806040')
    const provider = { request: requestMock }

    const contract = new Contract(dummyAddress, dummyAbi, provider)
    await contract.verify()

    expect(requestMock).toHaveBeenCalledWith({
      method: 'eth_getCode',
      params: [dummyAddress, 'latest'],
    })
  });

  it('supports client wrappers with publicClient', async () => {
    const getCodeMock = vi.fn().mockResolvedValue('0x60806040')
    const clientDeps = { publicClient: { getCode: getCodeMock } }

    const contract = new Contract(dummyAddress, dummyAbi, clientDeps as any)
    await contract.verify()

    expect(getCodeMock).toHaveBeenCalledWith({ address: dummyAddress })
  });

  it('throws WhiteChainError if provider does not support getCode or request', async () => {
    const invalidClient = {}

    const contract = new Contract(dummyAddress, dummyAbi, invalidClient as any)

    await expect(contract.verify()).rejects.toThrow('Client or provider does not support getCode or eth_getCode')
  });
})
