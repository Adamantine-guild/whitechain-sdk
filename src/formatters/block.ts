export interface RpcBlock {
  number: string | null;
  hash: string | null;
  parentHash: string;
  nonce: string | null;
  sha3Uncles: string;
  logsBloom: string | null;
  transactionsRoot: string;
  stateRoot: string;
  receiptsRoot: string;
  miner: string;
  difficulty: string;
  totalDifficulty: string | null;
  extraData: string;
  size: string;
  gasLimit: string;
  gasUsed: string;
  timestamp: string;
  transactions: string[] | any[];
  uncles: string[];
  baseFeePerGas?: string | null;
}

export interface Block {
  number: bigint | null;
  hash: string | null;
  parentHash: string;
  nonce: string | null;
  sha3Uncles: string;
  logsBloom: string | null;
  transactionsRoot: string;
  stateRoot: string;
  receiptsRoot: string;
  miner: string;
  difficulty: bigint;
  totalDifficulty: bigint | null;
  extraData: string;
  size: bigint;
  gasLimit: bigint;
  gasUsed: bigint;
  timestamp: number;
  transactions: string[] | any[];
  uncles: string[];
  baseFeePerGas?: bigint | null;
}

export function formatBlock(rpcBlock: RpcBlock | null | undefined): Block | null {
  if (!rpcBlock) return null;

  return {
    ...rpcBlock,
    number: rpcBlock.number ? BigInt(rpcBlock.number) : null,
    difficulty: BigInt(rpcBlock.difficulty),
    totalDifficulty: rpcBlock.totalDifficulty ? BigInt(rpcBlock.totalDifficulty) : null,
    size: BigInt(rpcBlock.size),
    gasLimit: BigInt(rpcBlock.gasLimit),
    gasUsed: BigInt(rpcBlock.gasUsed),
    timestamp: Number(rpcBlock.timestamp),
    baseFeePerGas: rpcBlock.baseFeePerGas ? BigInt(rpcBlock.baseFeePerGas) : null,
  };
}
