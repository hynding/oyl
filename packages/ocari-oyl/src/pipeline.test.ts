import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { DayKey, DEFAULT_NAME_CONFIG } from '@oyl/all-of-oyl'
import { processDocument, type OcrEngine, type StructuringEngine } from './pipeline.js'

const llmResult = {
  docType: 'receipt',
  date: '2026-07-24',
  merchant: { name: "Trader Joe's" },
  currency: 'USD',
  subtotal: '44.50',
  tax: '3.62',
  total: '48.12',
  lineItems: [{ name: 'a', totalPrice: '44.50' }],
}

const fakeOcr: OcrEngine = {
  name: 'fake-ocr@1',
  recognize: async () => [{ text: 'TRADER JOES', box: [0, 0, 10, 10] }, { text: 'TOTAL 48.12' }],
}
const fakeStructurer = (result: unknown): StructuringEngine => ({ model: 'fake-model', extract: async () => result })

const input = { bytes: new Uint8Array([9, 9, 9]), originalName: 'IMG_1.jpg', ext: 'jpg', mimeType: 'image/jpeg' }
const deps = (structured: unknown) => ({
  ocr: fakeOcr,
  structurer: fakeStructurer(structured),
  today: DayKey.of('2026-08-02'),
  name: DEFAULT_NAME_CONFIG,
  now: () => '2026-08-02T12:00:00.000Z',
})

describe('processDocument', () => {
  it('produces extraction, ok validation, rendered name, and a complete sidecar', async () => {
    const r = await processDocument(input, deps(llmResult))
    expect(r.validation.status).toBe('ok')
    expect(r.fileName).toBe('2026-07-24_trader-joes_48.12.jpg')
    expect(r.sidecar['version']).toBe(1)
    expect(r.sidecar['source']).toEqual({
      originalName: 'IMG_1.jpg',
      sha256: createHash('sha256').update(input.bytes).digest('hex'),
      mimeType: 'image/jpeg',
    })
    expect(r.sidecar['extraction']).toEqual(r.extraction.toJSON())
    expect(r.sidecar['ocr']).toEqual({ engine: 'fake-ocr@1', lines: await fakeOcr.recognize(input.bytes) })
    expect(r.sidecar['validation']).toEqual(r.validation)
    expect(r.sidecar['engine']).toEqual({ model: 'fake-model', createdAt: '2026-08-02T12:00:00.000Z' })
  })

  it('renders unknown segments and reports needs_review when required fields are missing', async () => {
    const r = await processDocument(input, deps({ docType: 'receipt', total: null, lineItems: [] }))
    expect(r.fileName).toBe('unknown_unknown_unknown.jpg')
    expect(r.validation.status).toBe('needs_review')
    const checks = r.validation.checks
    const requiredFieldsCheck = checks.find((c) => c.name === 'requiredFieldsPresent')
    // The validation failure is the actual source of needs_review (not the forcing branch).
    expect(requiredFieldsCheck?.status).toBe('fail')
  })

  it('propagates arithmetic failures as needs_review', async () => {
    const r = await processDocument(input, deps({ ...llmResult, total: '99.99' }))
    expect(r.validation.status).toBe('needs_review')
  })
})
