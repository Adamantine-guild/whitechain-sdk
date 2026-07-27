import { describe, it, expect } from 'vitest';
import { formatBlock, RpcBlock } from '../../src/formatters/block.js';

describe('formatBlock', () => {
  it('formats a valid RPC block correctly', () => {
    const rpcBlock: RpcBlock = {
      number: '0x10d4f',
      hash: '0xabc123',
      parentHash: '0xdef456',
      nonce: '0x0000000000000042',
      sha3Uncles: '0x1dcc4de8',
      logsBloom: '0x...',
      transactionsRoot: '0x56e81f17',
      stateRoot: '0xd5855eb0',
      receiptsRoot: '0x56e81f17',
      miner: '0x4e65fda2',
      difficulty: '0x0',
      totalDifficulty: '0x0',
      extraData: '0x',
      size: '0x27f',
      gasLimit: '0x1c9c380',
      gasUsed: '0x0',
      timestamp: '0x651c385c', // 1696348252
      transactions: [],
      uncles: [],
      baseFeePerGas: '0x3b9aca00', // 1000000000
    };

    const formatted = formatBlock(rpcBlock);

    expect(formatted).not.toBeNull();
    expect(formatted?.number).toBe(68943n);
    expect(formatted?.difficulty).toBe(0n);
    expect(formatted?.totalDifficulty).toBe(0n);
    expect(formatted?.size).toBe(639n);
    expect(formatted?.gasLimit).toBe(30000000n);
    expect(formatted?.gasUsed).toBe(0n);
    expect(formatted?.timestamp).toBe(1696348252);
    expect(formatted?.baseFeePerGas).toBe(1000000000n);
    expect(formatted?.hash).toBe('0xabc123');
  });

  it('handles null blocks gracefully', () => {
    expect(formatBlock(null)).toBeNull();
    expect(formatBlock(undefined)).toBeNull();
  });

  it('handles missing optional fields like baseFeePerGas', () => {
    const rpcBlock: RpcBlock = {
      number: '0x1',
      hash: '0xabc123',
      parentHash: '0xdef456',
      nonce: '0x0',
      sha3Uncles: '0x1',
      logsBloom: '0x...',
      transactionsRoot: '0x1',
      stateRoot: '0x1',
      receiptsRoot: '0x1',
      miner: '0x1',
      difficulty: '0x0',
      totalDifficulty: '0x0',
      extraData: '0x',
      size: '0x0',
      gasLimit: '0x1',
      gasUsed: '0x0',
      timestamp: '0x1', // 1
      transactions: [],
      uncles: [],
    };

    const formatted = formatBlock(rpcBlock);
    expect(formatted?.baseFeePerGas).toBeNull();
  });
});
