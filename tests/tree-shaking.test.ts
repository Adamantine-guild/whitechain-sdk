import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
// @ts-ignore - requires `npm run build` first
import { formatUnits as formatUnitsEsm, parseUnits as parseUnitsEsm } from '../dist/esm/utils/index.js'
// @ts-ignore - test CJS import
import * as cjsUtils from '../dist/cjs/utils/index.js'

describe('Tree-shaking & Split Entry Points', () => {
  it('exports formatUnits and parseUnits from ESM utils entry point without loading viem', () => {
    expect(formatUnitsEsm(1000000000000000000n, 18)).toBe('1.0')
    expect(parseUnitsEsm('1.0', 18)).toBe(1000000000000000000n)
  })

  it('exports formatUnits and parseUnits from CJS utils entry point', () => {
    expect(cjsUtils.formatUnits(2000000000000000000n, 18)).toBe('2.0')
    expect(cjsUtils.parseUnits('2.0', 18)).toBe(2000000000000000000n)
  })

  it('verifies that dist/esm/utils contains no viem dependency or side effects', () => {
    const utilsIndexPath = path.resolve('dist/esm/utils/index.js')
    const utilsMathPath = path.resolve('dist/esm/utils/math.js')

    const utilsIndexContent = fs.readFileSync(utilsIndexPath, 'utf-8')
    const utilsMathContent = fs.readFileSync(utilsMathPath, 'utf-8')

    expect(utilsIndexContent).not.toContain('viem')
    expect(utilsMathContent).not.toContain('viem')
    expect(utilsIndexContent).not.toContain('createWhiteChainClient')
    expect(utilsMathContent).not.toContain('createWhiteChainClient')
  })

  it('verifies package.json has sideEffects set to false and exports map configured for dual ESM/CJS', () => {
    const pkgPath = path.resolve('package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

    expect(pkg.sideEffects).toBe(false)
    expect(pkg.exports['.']).toBeDefined()
    expect(pkg.exports['./utils']).toBeDefined()
    expect(pkg.exports['./providers']).toBeDefined()

    expect(pkg.exports['./utils'].import).toBe('./dist/esm/utils/index.js')
    expect(pkg.exports['./utils'].require).toBe('./dist/cjs/utils/index.js')
  })
})
