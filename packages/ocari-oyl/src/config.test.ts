import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from './config.js'

const empty = { flags: {}, env: {}, dotenv: '' }

describe('loadConfig', () => {
  it('applies defaults', () => {
    const c = loadConfig(empty)
    expect(c.ollamaUrl).toBe('http://localhost:11434')
    expect(c.model).toBe('qwen2.5-vl:7b')
    expect(c.name.template).toBe('<date>_<business>_<total>.<ext>')
    expect(c.name.prefix).toBe('')
    expect(c.name.dateFormat).toBe('YYYY-MM-DD')
    expect(c.name.timeFormat).toBe('HHmm')
    expect(c.rename).toBe(false)
    expect(c.dryRun).toBe(false)
  })

  it('reads OYL_OCARI_* keys from the .env contents without sourcing it wholesale', () => {
    const dotenv = [
      'OYL_PI_HOST=pi.local', // unrelated key, ignored because it isn't queried
      'OYL_OCARI_MODEL=llava:13b',
      'OYL_OCARI_DATE_FORMAT=YYYYMMDD',
      'OYL_OCARI_NAME_PREFIX="<CATEGORY>_"',
    ].join('\n')
    const c = loadConfig({ ...empty, dotenv })
    expect(c.model).toBe('llava:13b')
    expect(c.name.dateFormat).toBe('YYYYMMDD')
    expect(c.name.prefix).toBe('<CATEGORY>_') // surrounding quotes stripped
  })

  it('preserves a literal "#" in a value instead of treating it as a comment', () => {
    const c = loadConfig({ ...empty, dotenv: 'OYL_OCARI_MODEL=foo#bar' })
    expect(c.model).toBe('foo#bar')
  })

  it('preserves a literal "#" inside a quoted value, stripping only the quotes', () => {
    const c = loadConfig({ ...empty, dotenv: 'OYL_OCARI_NAME_PREFIX="#tag_"' })
    expect(c.name.prefix).toBe('#tag_')
  })

  it('precedence: flag > env > .env > default', () => {
    const c = loadConfig({
      flags: { model: 'from-flag' },
      env: { OYL_OCARI_MODEL: 'from-env', OYL_OCARI_TIME_FORMAT: 'HH-mm' },
      dotenv: 'OYL_OCARI_MODEL=from-dotenv\nOYL_OCARI_TIME_FORMAT=HHmm',
    })
    expect(c.model).toBe('from-flag')
    expect(c.name.timeFormat).toBe('HH-mm')
  })

  it('fails fast on an invalid template, listing valid variables', () => {
    expect(() => loadConfig({ ...empty, flags: { 'name-template': '<merchant>.<ext>' } })).toThrowError(ConfigError)
    try {
      loadConfig({ ...empty, flags: { 'name-template': '<merchant>.<ext>' } })
    } catch (e) {
      expect((e as Error).message).toContain('<merchant>')
      expect((e as Error).message).toContain('business')
    }
  })

  it('fails fast on an invalid date format', () => {
    expect(() => loadConfig({ ...empty, env: { OYL_OCARI_DATE_FORMAT: 'YY' } })).toThrowError(ConfigError)
  })
})
