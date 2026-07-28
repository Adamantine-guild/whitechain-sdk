import { keccak256, concat, toHex } from 'viem';

/**
 * OpenZeppelin-compatible Merkle Tree implementation.
 * Uses keccak256 hashing and lexicographical pair sorting.
 */
export class MerkleTree {
  private leaves: string[];
  private layers: string[][];

  constructor(leaves: (string | Uint8Array)[]) {
    if (leaves.length === 0) {
      throw new Error('Tree must have at least 1 leaf');
    }
    
    // Normalize to lowercase 0x-prefixed hex strings
    this.leaves = leaves.map(l => {
      const hex = typeof l === 'string' ? (l.startsWith('0x') ? l : `0x${l}`) : toHex(l);
      return hex.toLowerCase();
    });

    this.layers = this.buildTree(this.leaves);
  }

  private hashPair(a: string, b: string): string {
    // OpenZeppelin standard pair sorting (lexicographical for lowercase hex)
    const [min, max] = a < b ? [a, b] : [b, a];
    return keccak256(concat([min as `0x${string}`, max as `0x${string}`]));
  }

  private buildTree(leaves: string[]): string[][] {
    const layers: string[][] = [leaves];

    while (layers[layers.length - 1].length > 1) {
      const currentLayer = layers[layers.length - 1];
      const nextLayer: string[] = [];

      for (let i = 0; i < currentLayer.length; i += 2) {
        if (i + 1 === currentLayer.length) {
          // Odd node at the end is promoted to the next layer unchanged
          nextLayer.push(currentLayer[i]);
        } else {
          // Hash the sibling pair
          nextLayer.push(this.hashPair(currentLayer[i], currentLayer[i + 1]));
        }
      }

      layers.push(nextLayer);
    }

    return layers;
  }

  /**
   * Retrieves the computed Merkle Root.
   */
  getHexRoot(): string {
    return this.layers[this.layers.length - 1][0];
  }

  /**
   * Generates a Merkle Proof for a given leaf.
   */
  getHexProof(leaf: string | Uint8Array): string[] {
    const rawHex = typeof leaf === 'string' ? (leaf.startsWith('0x') ? leaf : `0x${leaf}`) : toHex(leaf);
    const leafHex = rawHex.toLowerCase();

    let index = this.leaves.indexOf(leafHex);
    if (index === -1) {
      throw new Error('Leaf not found in tree');
    }

    const proof: string[] = [];
    for (let i = 0; i < this.layers.length - 1; i++) {
      const layer = this.layers[i];
      const isRightNode = index % 2 === 1;
      const siblingIndex = isRightNode ? index - 1 : index + 1;

      // Only push sibling if it actually exists (skips odd-node promotions)
      if (siblingIndex < layer.length) {
        proof.push(layer[siblingIndex]);
      }

      // Move pointer to parent node index in the next layer
      index = Math.floor(index / 2);
    }

    return proof;
  }

  /**
   * OpenZeppelin compatible local verifier.
   * Mirrors `MerkleProof.verify` contract behavior.
   */
  static verify(proof: string[], leaf: string | Uint8Array, root: string): boolean {
    const rawHex = typeof leaf === 'string' ? (leaf.startsWith('0x') ? leaf : `0x${leaf}`) : toHex(leaf);
    let computedHash = rawHex.toLowerCase();
    const targetRoot = root.toLowerCase();

    for (let i = 0; i < proof.length; i++) {
      const proofElement = proof[i].toLowerCase();

      // Pair sorting
      const [min, max] = computedHash < proofElement 
        ? [computedHash, proofElement] 
        : [proofElement, computedHash];
        
      computedHash = keccak256(concat([min as `0x${string}`, max as `0x${string}`]));
    }

    return computedHash === targetRoot;
  }
}
