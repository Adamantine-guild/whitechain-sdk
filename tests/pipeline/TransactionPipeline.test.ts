import { describe, it, expect, vi } from 'vitest'
import {
  TransactionPipeline,
  createTransactionPipeline,
  createMemoryStorage,
} from '../../src/pipeline/TransactionPipeline.js'
import type { PipelineSnapshot } from '../../src/pipeline/states.js'

describe('TransactionPipeline FSM', () => {
  it('runs multi-step operations sequentially with typed progress updates', async () => {
    const events: string[] = []
    const hashes: string[] = []

    const pipeline = createTransactionPipeline<{ approvalHash?: string; depositHash?: string }>({
      id: 'vault-flow',
      steps: [
        {
          id: 'approve',
          label: 'Approve token',
          run: async (_ctx, h) => {
            const hash = '0xapprove'
            h.updateContext({ approvalHash: hash })
            return { transactionHash: hash }
          },
        },
        {
          id: 'deposit',
          label: 'Deposit into vault',
          run: async (ctx) => {
            expect(ctx.approvalHash).toBe('0xapprove')
            const hash = '0xdeposit'
            return { transactionHash: hash }
          },
        },
      ],
    })

    pipeline.onStateChange((e) => {
      events.push(`${e.type}:${e.status}:${e.step?.id ?? '-'}`)
      if (e.step?.transactionHash) hashes.push(e.step.transactionHash)
    })

    const snap = await pipeline.start()
    expect(snap.status).toBe('completed')
    expect(snap.steps.map((s) => s.status)).toEqual(['succeeded', 'succeeded'])
    expect(snap.steps[0].transactionHash).toBe('0xapprove')
    expect(snap.steps[1].transactionHash).toBe('0xdeposit')
    expect(events.some((e) => e.startsWith('stepStart:running:approve'))).toBe(true)
    expect(events.some((e) => e.startsWith('stepSuccess:running:deposit') || e.startsWith('stepSuccess:completed:deposit') || e.includes('stepSuccess'))).toBe(true)
    expect(events.some((e) => e.startsWith('completed:'))).toBe(true)
  })

  it('halts cleanly on step failure without corrupting prior step metadata', async () => {
    const pipeline = new TransactionPipeline({
      id: 'fail-midway',
      steps: [
        {
          id: 'approve',
          run: async () => ({ transactionHash: '0xok' }),
        },
        {
          id: 'deposit',
          run: async () => {
            throw new Error('User rejected the request')
          },
        },
        {
          id: 'stake',
          run: async () => ({ transactionHash: '0xnever' }),
        },
      ],
    })

    const snap = await pipeline.start()
    expect(snap.status).toBe('failed')
    expect(snap.currentStepIndex).toBe(1)
    expect(snap.steps[0].status).toBe('succeeded')
    expect(snap.steps[0].transactionHash).toBe('0xok')
    expect(snap.steps[1].status).toBe('failed')
    expect(snap.steps[1].errorMessage).toMatch(/User rejected/)
    expect(snap.steps[2].status).toBe('pending')
    expect(snap.errorMessage).toMatch(/User rejected/)
  })

  it('serializes to JSON and resumes from the exact failed step', async () => {
    const storage = createMemoryStorage()
    let depositAttempts = 0

    const makePipeline = () =>
      createTransactionPipeline<{ nonce?: number }>({
        id: 'resume-demo',
        storage,
        initialContext: { nonce: 1 },
        steps: [
          {
            id: 'approve',
            run: async () => ({ transactionHash: '0xA' }),
          },
          {
            id: 'deposit',
            run: async () => {
              depositAttempts++
              if (depositAttempts === 1) {
                throw new Error('temporary RPC failure')
              }
              return { transactionHash: '0xB' }
            },
          },
        ],
      })

    const p1 = makePipeline()
    const failed = await p1.start()
    expect(failed.status).toBe('failed')
    expect(failed.steps[0].status).toBe('succeeded')

    // Simulate page reload: new instance loads checkpoint
    const p2 = makePipeline()
    const loaded = await p2.loadFromStorage()
    expect(loaded).toBe(true)
    expect(p2.status).toBe('failed')
    expect(p2.currentStepIndex).toBe(1)
    expect(p2.context.nonce).toBe(1)

    // Snapshot is fully JSON-serializable
    const json = JSON.stringify(p2.getSnapshot())
    const rehydrated = JSON.parse(json) as PipelineSnapshot
    expect(rehydrated.version).toBe(1)
    expect(rehydrated.steps[0].transactionHash).toBe('0xA')

    const resumed = await p2.resume()
    expect(resumed.status).toBe('completed')
    expect(resumed.steps.map((s) => s.status)).toEqual(['succeeded', 'succeeded'])
    expect(resumed.steps[1].transactionHash).toBe('0xB')
    expect(depositAttempts).toBe(2)
  })

  it('skips steps when when() returns false', async () => {
    const pipeline = createTransactionPipeline<{ needsApprove: boolean }>({
      id: 'skip',
      initialContext: { needsApprove: false },
      steps: [
        {
          id: 'approve',
          when: (ctx) => ctx.needsApprove,
          run: async () => ({ transactionHash: '0xskip-me' }),
        },
        {
          id: 'deposit',
          run: async () => ({ transactionHash: '0xdep' }),
        },
      ],
    })

    const snap = await pipeline.start()
    expect(snap.steps[0].status).toBe('skipped')
    expect(snap.steps[1].status).toBe('succeeded')
    expect(snap.status).toBe('completed')
  })

  it('supports cancel between steps', async () => {
    const pipeline = createTransactionPipeline({
      id: 'cancel-me',
      steps: [
        {
          id: 'one',
          run: async (_c, h) => {
            h.throwIfCancelled()
            return { transactionHash: '0x1' }
          },
        },
        {
          id: 'two',
          run: async () => {
            // cancel will be requested after step one
            return { transactionHash: '0x2' }
          },
        },
      ],
    })

    pipeline.onStateChange((e) => {
      if (e.type === 'stepSuccess' && e.step?.id === 'one') {
        pipeline.cancel()
      }
    })

    const snap = await pipeline.start()
    expect(snap.status).toBe('cancelled')
    expect(snap.steps[0].status).toBe('succeeded')
    expect(snap.steps[1].status).toBe('pending')
  })

  it('reset restores idle pending steps', async () => {
    const pipeline = createTransactionPipeline({
      id: 'reset',
      steps: [{ id: 'only', run: async () => ({ transactionHash: '0x' }) }],
    })
    await pipeline.start()
    expect(pipeline.status).toBe('completed')
    pipeline.reset()
    expect(pipeline.status).toBe('idle')
    expect(pipeline.getSnapshot().steps[0].status).toBe('pending')
  })
})
