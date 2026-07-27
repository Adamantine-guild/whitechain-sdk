import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return listTsFiles(full)
    return entry.name.endsWith('.ts') ? [full] : []
  })
}

/**
 * Issue #13: this SDK is built entirely on viem (which uses native `fetch`
 * internally) and should stay that way — no axios or other external HTTP
 * client dependency. These checks fail loudly if that ever regresses,
 * rather than relying on someone noticing in review.
 */
describe('no axios dependency (#13)', () => {
  it('is absent from package.json dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }
    expect(Object.keys(deps)).not.toContain('axios')
  })

  it('is never imported anywhere in src/', () => {
    const files = listTsFiles(join(repoRoot, 'src'))
    for (const file of files) {
      const content = readFileSync(file, 'utf-8')
      expect(content, `${file} should not import axios`).not.toMatch(/from ['"]axios['"]|require\(['"]axios['"]\)/)
    }
  })
})
