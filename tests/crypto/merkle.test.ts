import { describe, it, expect } from 'vitest';
import { MerkleTree } from '../../src/crypto/merkle.js';
import { keccak256, toHex } from 'viem';

describe('MerkleTree', () => {
  // Generate some deterministically hashed leaves for testing
  const generateLeaves = (count: number) => {
    return Array.from({ length: count }, (_, i) => keccak256(toHex(i, { size: 32 })));
  };

  it('rejects an empty array of leaves', () => {
    expect(() => new MerkleTree([])).toThrow('Tree must have at least 1 leaf');
  });

  it('builds a tree and generates valid proofs for an even number of leaves', () => {
    const leaves = generateLeaves(4);
    const tree = new MerkleTree(leaves);
    const root = tree.getHexRoot();

    expect(root).toBeDefined();

    for (const leaf of leaves) {
      const proof = tree.getHexProof(leaf);
      expect(proof.length).toBeGreaterThan(0);
      expect(MerkleTree.verify(proof, leaf, root)).toBe(true);
    }
  });

  it('builds a tree and generates valid proofs for an odd number of leaves', () => {
    const leaves = generateLeaves(5);
    const tree = new MerkleTree(leaves);
    const root = tree.getHexRoot();

    expect(root).toBeDefined();

    for (const leaf of leaves) {
      const proof = tree.getHexProof(leaf);
      expect(MerkleTree.verify(proof, leaf, root)).toBe(true);
    }
  });

  it('handles a tree with exactly 1 leaf', () => {
    const leaves = generateLeaves(1);
    const tree = new MerkleTree(leaves);
    const root = tree.getHexRoot();

    expect(root).toBe(leaves[0]); // The root of a 1-leaf tree is just the leaf itself

    const proof = tree.getHexProof(leaves[0]);
    expect(proof.length).toBe(0); // No siblings
    expect(MerkleTree.verify(proof, leaves[0], root)).toBe(true);
  });

  it('correctly rejects invalid proofs', () => {
    const leaves = generateLeaves(4);
    const tree = new MerkleTree(leaves);
    const root = tree.getHexRoot();

    const proof = tree.getHexProof(leaves[0]);
    
    // Tamper with the proof
    const fakeProof = [...proof];
    fakeProof[0] = leaves[2]; // replace a sibling hash with an unrelated one

    expect(MerkleTree.verify(fakeProof, leaves[0], root)).toBe(false);

    // Test with completely wrong leaf but correct proof
    expect(MerkleTree.verify(proof, leaves[1], root)).toBe(false);
  });

  it('throws an error if asked for a proof of a non-existent leaf', () => {
    const leaves = generateLeaves(4);
    const tree = new MerkleTree(leaves);

    expect(() => tree.getHexProof(keccak256(toHex(999, { size: 32 })))).toThrow('Leaf not found in tree');
  });

  it('accepts Uint8Array buffers as input and handles them identically', () => {
    // We mock 2 bytes buffers
    const bufferLeaves = [
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4, 5, 6]),
      new Uint8Array([7, 8, 9])
    ];

    const tree = new MerkleTree(bufferLeaves);
    const root = tree.getHexRoot();

    // Request proof using the same buffer
    const proof = tree.getHexProof(bufferLeaves[1]);
    expect(MerkleTree.verify(proof, bufferLeaves[1], root)).toBe(true);

    // Request proof using the hex equivalent
    const hexEquivalent = toHex(bufferLeaves[1]);
    const proof2 = tree.getHexProof(hexEquivalent);
    expect(MerkleTree.verify(proof2, hexEquivalent, root)).toBe(true);
  });
});
