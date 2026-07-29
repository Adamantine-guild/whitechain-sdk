import { describe, it, expect, vi } from 'vitest'
import { Contract } from '../../src/core/Contract'
import { Contract } from '../../src/core/Contract.js'
import { describe, expect, it, vi } from 'vitest'
import { Contract } from '../../src/core/Contract.js'
import { WhiteChainError } from '../../src/types.js'

describe('Contract class and verify() opt-in check', () => {
// ---------------------------------------------------------------------------
// verify() — opt-in bytecode check
// ---------------------------------------------------------------------------

describe('Contract — verify() opt-in bytecode check', () => {
  const dummyAddress = '0x1234567890123456789012345678901234567890'
  const dummyAbi: any[] = []

  it('throws WhiteChainError if initialized without an address', () => {
    expect(() => new Contract('' as any, dummyAbi, {} as any)).toThrow(WhiteChainError)
  });
  })

  it('is an explicit opt-in check and does not call RPC upon instantiation', () => {
    const getCodeMock = vi.fn()
    const client = { getCode: getCodeMock }

    const contract = new Contract(dummyAddress, dummyAbi, client)
    expect(contract.address).toBe(dummyAddress)
    expect(getCodeMock).not.toHaveBeenCalled()
  });
  })

  it('succeeds and returns the Contract instance when bytecode exists (non-0x)', async () => {
    const getCodeMock = vi.fn().mockResolvedValue('0x608060405260043610601157')
    const client = { getCode: getCodeMock }

    const contract = new Contract(dummyAddress, dummyAbi, client)
    const result = await contract.verify()

    expect(getCodeMock).toHaveBeenCalledWith({ address: dummyAddress })
    expect(result).toBe(contract)
  });
  })

  it('throws WhiteChainError if bytecode is 0x (contract does not exist)', async () => {
    const getCodeMock = vi.fn().mockResolvedValue('0x')
    const client = { getCode: getCodeMock }

    const contract = new Contract(dummyAddress, dummyAbi, client)

    await expect(contract.verify()).rejects.toThrow(WhiteChainError)
    await expect(contract.verify()).rejects.toThrow("No contract code deployed at address 0x1234567890123456789012345678901234567890 (code is '0x')")
  });
  })

  it('throws WhiteChainError if bytecode is 0x0 or empty', async () => {
    const getCodeMock = vi.fn().mockResolvedValue('0x0')
    const client = { getCode: getCodeMock }

    const contract = new Contract(dummyAddress, dummyAbi, client)

    await expect(contract.verify()).rejects.toThrow(WhiteChainError)
  });
  })

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
  })

  it('supports client wrappers with publicClient', async () => {
    const getCodeMock = vi.fn().mockResolvedValue('0x60806040')
    const clientDeps = { publicClient: { getCode: getCodeMock } }

    const contract = new Contract(dummyAddress, dummyAbi, clientDeps as any)
    await contract.verify()

    expect(getCodeMock).toHaveBeenCalledWith({ address: dummyAddress })
  });
  })

  it('throws WhiteChainError if provider does not support getCode or request', async () => {
    const invalidClient = {}

    const contract = new Contract(dummyAddress, dummyAbi, invalidClient as any)

    await expect(contract.verify()).rejects.toThrow('Client or provider does not support getCode or eth_getCode')
  });
  })
})

// ---------------------------------------------------------------------------
// read() / write() — typed contract interaction
// ---------------------------------------------------------------------------

const mockAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

describe('Contract', () => {
describe('Contract — read() / write()', () => {
  it('calls readContract on publicClient for view functions', async () => {
    const publicClient = {
      readContract: vi.fn().mockResolvedValue(100n),
    } as any

    const contract = new Contract('0x1234567890123456789012345678901234567890', mockAbi, publicClient)
    
    // Type checking ensures 'balanceOf' and ['0x...'] are required
    const result = await contract.read('balanceOf', ['0xabcdef1234567890abcdef1234567890abcdef12'])
    

    const result = await contract.read('balanceOf', ['0xabcdef1234567890abcdef1234567890abcdef12'])

    expect(result).toBe(100n)
    expect(publicClient.readContract).toHaveBeenCalledWith({
      address: '0x1234567890123456789012345678901234567890',
      abi: mockAbi,
      functionName: 'balanceOf',
      args: ['0xabcdef1234567890abcdef1234567890abcdef12'],
    })
  })

  it('calls writeContract on walletClient for nonpayable functions', async () => {
    const walletClient = {
      writeContract: vi.fn().mockResolvedValue('0xhash'),
    } as any

    const contract = new Contract('0x1234567890123456789012345678901234567890', mockAbi, undefined, walletClient)
    
    // Type checking ensures 'transfer' and correct arguments are required
    const result = await contract.write('transfer', ['0xabcdef1234567890abcdef1234567890abcdef12', 50n])
    

    const result = await contract.write('transfer', ['0xabcdef1234567890abcdef1234567890abcdef12', 50n])

    expect(result).toBe('0xhash')
    expect(walletClient.writeContract).toHaveBeenCalledWith({
      address: '0x1234567890123456789012345678901234567890',
      abi: mockAbi,
      functionName: 'transfer',
      args: ['0xabcdef1234567890abcdef1234567890abcdef12', 50n],
    })
  })

  it('throws if clients are missing', async () => {
    const contract = new Contract('0x1234567890123456789012345678901234567890', mockAbi)
    
  it('throws if clients are missing', async () => {
    const contract = new Contract('0x1234567890123456789012345678901234567890', mockAbi)

    await expect(contract.read('balanceOf', ['0x123'])).rejects.toThrow('PublicClient is not initialized for read operations')
    await expect(contract.write('transfer', ['0x123', 50n])).rejects.toThrow('WalletClient is not initialized for write operations')
  })
})
