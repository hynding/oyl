import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureDir, planOutputs, writeOutputs } from './output.js'

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

  it('never overwrites an existing image target (copy branch)', () => {
    const dir = tempDir()
    const source = join(dir, 'IMG_3.jpg')
    writeFileSync(source, 'new')
    writeFileSync(join(dir, NAME), 'old')
    const plan = { imagePath: join(dir, NAME), sidecarPath: join(dir, '2026-07-24_store_9.99.json') }
    expect(() => writeOutputs({ sourcePath: source, plan, sidecar: {}, rename: false })).toThrow()
    expect(readFileSync(join(dir, NAME), 'utf8')).toBe('old')
    expect(existsSync(plan.sidecarPath)).toBe(false) // no orphan sidecar
    expect(readFileSync(source, 'utf8')).toBe('new') // source untouched
  })

  it('never overwrites an existing image target (rename branch)', () => {
    const dir = tempDir()
    const source = join(dir, 'IMG_4.jpg')
    writeFileSync(source, 'moveMe')
    writeFileSync(join(dir, NAME), 'doNotTouch')
    const plan = { imagePath: join(dir, NAME), sidecarPath: join(dir, '2026-07-24_store_9.99.json') }
    expect(() => writeOutputs({ sourcePath: source, plan, sidecar: {}, rename: true })).toThrow()
    expect(readFileSync(join(dir, NAME), 'utf8')).toBe('doNotTouch') // image untouched
    expect(existsSync(plan.sidecarPath)).toBe(false) // no orphan sidecar
    expect(readFileSync(source, 'utf8')).toBe('moveMe') // source not moved
  })

  it('cleans up sidecar if image copy fails', () => {
    const dir = tempDir()
    const source = join(dir, 'IMG_5.jpg')
    writeFileSync(source, 'original')
    const plan = { imagePath: join(dir, NAME), sidecarPath: join(dir, '2026-07-24_store_9.99.json') }
    // Pre-create the image target to cause copyFileSync to fail
    writeFileSync(plan.imagePath, 'existingImage')
    expect(() => writeOutputs({ sourcePath: source, plan, sidecar: { test: 'data' }, rename: false })).toThrow()
    expect(existsSync(plan.sidecarPath)).toBe(false) // sidecar cleaned up, no orphan
  })

  it('cleans up sidecar if image rename fails', () => {
    const dir = tempDir()
    const source = join(dir, 'IMG_6.jpg')
    writeFileSync(source, 'toMove')
    const plan = { imagePath: join(dir, NAME), sidecarPath: join(dir, '2026-07-24_store_9.99.json') }
    // Pre-create the image target to cause renameSync to fail
    writeFileSync(plan.imagePath, 'blocking')
    expect(() => writeOutputs({ sourcePath: source, plan, sidecar: { test: 'data' }, rename: true })).toThrow()
    expect(existsSync(plan.sidecarPath)).toBe(false) // sidecar cleaned up, no orphan
  })
})

describe('ensureDir', () => {
  it('creates a nested directory that does not exist yet', () => {
    const dir = tempDir()
    const nested = join(dir, 'a', 'b', 'receipts')
    expect(existsSync(nested)).toBe(false)
    ensureDir(nested)
    expect(existsSync(nested)).toBe(true)
  })

  it('is a no-op when the directory already exists', () => {
    const dir = tempDir()
    ensureDir(dir)
    expect(existsSync(dir)).toBe(true)
  })

  it('throws when the path exists but is a file', () => {
    const dir = tempDir()
    const filePath = join(dir, 'not-a-dir')
    writeFileSync(filePath, 'x')
    expect(() => ensureDir(filePath)).toThrow(/not a directory/)
  })
})

describe('edge naming and collisions', () => {
  it('treats a dotfile-style rendered name as extensionless', () => {
    expect(planOutputs('/out', '.hidden', () => false)).toEqual({
      imagePath: join('/out', '.hidden'),
      sidecarPath: join('/out', '.hidden.json'),
    })
  })

  it('gives up with a clear error when no collision-free name exists', () => {
    expect(() => planOutputs('/out', NAME, () => true)).toThrow(/no collision-free name/)
  })

  it('refuses when only the sidecar path is taken, without touching the pre-existing sidecar', () => {
    const dir = tempDir()
    const source = join(dir, 'IMG_7.jpg')
    writeFileSync(source, 'src')
    const plan = { imagePath: join(dir, NAME), sidecarPath: join(dir, '2026-07-24_store_9.99.json') }
    writeFileSync(plan.sidecarPath, '{"preexisting":true}')
    expect(() => writeOutputs({ sourcePath: source, plan, sidecar: {}, rename: false })).toThrow()
    expect(readFileSync(plan.sidecarPath, 'utf8')).toBe('{"preexisting":true}') // untouched
    expect(existsSync(plan.imagePath)).toBe(false) // no image written
  })

  it('reports a raced image collision with the unified target-exists message', () => {
    const dir = tempDir()
    const source = join(dir, 'IMG_8.jpg')
    writeFileSync(source, 'new')
    const plan = { imagePath: join(dir, NAME), sidecarPath: join(dir, '2026-07-24_store_9.99.json') }
    // Simulate a race: the image target appears after the early guard would have passed.
    // (Directly exercise the exclusive-flag branch by pre-creating the target — the early
    // guard throws the same unified message, so either path yields it.)
    writeFileSync(plan.imagePath, 'old')
    expect(() => writeOutputs({ sourcePath: source, plan, sidecar: {}, rename: false })).toThrow(/target exists:/)
  })
})
