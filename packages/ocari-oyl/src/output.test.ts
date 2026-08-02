import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { planOutputs, writeOutputs } from './output.js'

const NAME = '2026-07-24_store_9.99.jpg'

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'ocari-test-'))
}

describe('planOutputs', () => {
  it('uses the rendered name when free', () => {
    expect(planOutputs('/out', NAME, () => false)).toEqual({
      imagePath: join('/out', NAME),
      sidecarPath: join('/out', '2026-07-24_store_9.99.json'),
    })
  })

  it('suffixes _2, _3 before the extension until both paths are free', () => {
    const taken = new Set([join('/out', NAME), join('/out', '2026-07-24_store_9.99_2.json')])
    expect(planOutputs('/out', NAME, (p) => taken.has(p)).imagePath).toBe(join('/out', '2026-07-24_store_9.99_3.jpg'))
  })
})

describe('writeOutputs', () => {
  it('copies by default, leaving the original in place, and writes the sidecar', () => {
    const dir = tempDir()
    const source = join(dir, 'IMG_1.jpg')
    writeFileSync(source, 'imagebytes')
    const plan = planOutputs(dir, NAME, existsSync)
    writeOutputs({ sourcePath: source, plan, sidecar: { version: 1 }, rename: false })
    expect(existsSync(source)).toBe(true)
    expect(readFileSync(plan.imagePath, 'utf8')).toBe('imagebytes')
    expect(JSON.parse(readFileSync(plan.sidecarPath, 'utf8'))).toEqual({ version: 1 })
    expect(readFileSync(plan.sidecarPath, 'utf8').endsWith('\n')).toBe(true)
  })

  it('moves the original when rename=true', () => {
    const dir = tempDir()
    const source = join(dir, 'IMG_2.jpg')
    writeFileSync(source, 'x')
    const plan = planOutputs(dir, NAME, existsSync)
    writeOutputs({ sourcePath: source, plan, sidecar: {}, rename: true })
    expect(existsSync(source)).toBe(false)
    expect(existsSync(plan.imagePath)).toBe(true)
  })

  it('never overwrites an existing target', () => {
    const dir = tempDir()
    const source = join(dir, 'IMG_3.jpg')
    writeFileSync(source, 'new')
    writeFileSync(join(dir, NAME), 'old')
    // stale exists() said the name was free — the exclusive flag must still refuse
    const plan = { imagePath: join(dir, NAME), sidecarPath: join(dir, '2026-07-24_store_9.99.json') }
    expect(() => writeOutputs({ sourcePath: source, plan, sidecar: {}, rename: false })).toThrow()
    expect(readFileSync(join(dir, NAME), 'utf8')).toBe('old')
  })
})
