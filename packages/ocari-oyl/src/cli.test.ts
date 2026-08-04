import { describe, expect, it } from 'vitest'
import { parseCliArgs, resolveUserPath } from './cli.js'

describe('resolveUserPath', () => {
  it('passes an absolute path through unchanged', () => {
    expect(resolveUserPath('/repo', '/other/photo.jpg')).toBe('/other/photo.jpg')
  })

  it('joins a relative path onto the given base', () => {
    expect(resolveUserPath('/repo', 'photo.jpg')).toBe('/repo/photo.jpg')
    expect(resolveUserPath('/repo', './receipts/photo.jpg')).toBe('/repo/receipts/photo.jpg')
  })
})

describe('parseCliArgs', () => {
  it('separates positionals from flags', () => {
    const parsed = parseCliArgs([
      'a.jpg', 'b.png',
      '--rename', '--dry-run',
      '--out', '/tmp/receipts',
      '--model', 'llava:13b',
      '--name-template', '<date>_<total>.<ext>',
      '--name-prefix', 'RECEIPT_',
      '--date-format', 'YYYYMMDD',
      '--time-format', 'HH-mm',
    ])
    expect(parsed.files).toEqual(['a.jpg', 'b.png'])
    expect(parsed.help).toBe(false)
    expect(parsed.flags).toEqual({
      rename: true,
      'dry-run': true,
      out: '/tmp/receipts',
      model: 'llava:13b',
      'name-template': '<date>_<total>.<ext>',
      'name-prefix': 'RECEIPT_',
      'date-format': 'YYYYMMDD',
      'time-format': 'HH-mm',
    })
  })

  it('defaults to no flags and flags help', () => {
    expect(parseCliArgs([])).toEqual({ files: [], flags: {}, help: false })
    expect(parseCliArgs(['--help']).help).toBe(true)
  })

  it('throws a usage error on unknown flags', () => {
    expect(() => parseCliArgs(['x.jpg', '--bogus'])).toThrow(/bogus/)
  })
})
