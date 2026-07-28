import { describe, it, expect, vi } from 'vitest'
import { Contract } from '../../src/core/Contract.js'

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
  it('calls readContract on publicClient for view functions', async () => {
    const publicClient = {
      readContract: vi.fn().mockResolvedValue(100n),
    } as any

    const contract = new Contract('0x1234567890123456789012345678901234567890', mockAbi, publicClient)
    
    // Type checking ensures 'balanceOf' and ['0x...'] are required
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
    
    await expect(contract.read('balanceOf', ['0x123'])).rejects.toThrow('PublicClient is not initialized for read operations')
    await expect(contract.write('transfer', ['0x123', 50n])).rejects.toThrow('WalletClient is not initialized for write operations')
  })
})
