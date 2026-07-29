import { describe, it, expect } from 'vitest'
import { MockProvider, returns } from '../../src/testing/MockProvider'
import { MockProvider, returns } from '../../src/testing/MockProvider.js'

describe('MockProvider', () => {
  it('intercepts calls and returns dummy data', async () => {
    const mockProvider = new MockProvider()
    const blockData = { number: '0x1b4', hash: '0xabc' }
    
    mockProvider.on('eth_getBlockByNumber', returns(blockData))
    
    const result = await mockProvider.request({ method: 'eth_getBlockByNumber', params: ['latest', false] })
    expect(result).toBe(blockData)
  })

  it('strictly matches standard JSON-RPC schema', async () => {
    const mockProvider = new MockProvider()
    
    // Invalid jsonrpc version
    await expect(mockProvider.request({ method: 'eth_chainId', jsonrpc: '1.0' as any }))
      .rejects.toEqual({ code: -32600, message: 'Invalid Request: jsonrpc must be exactly "2.0"' })
      
    // Missing method
    await expect(mockProvider.request({} as any))
      .rejects.toEqual({ code: -32600, message: 'Invalid Request: method must be a string' })
      
    // Invalid params type
    await expect(mockProvider.request({ method: 'eth_call', params: 'invalid' as any }))
      .rejects.toEqual({ code: -32600, message: 'Invalid Request: params must be an Array or Object' })
  })

  it('throws Method not found for unregistered mocks', async () => {
    const mockProvider = new MockProvider()
    
    await expect(mockProvider.request({ method: 'eth_chainId' }))
      .rejects.toEqual({ code: -32601, message: 'Method not found: eth_chainId' })
  })
})
