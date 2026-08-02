import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DayKey, DEFAULT_NAME_CONFIG, ExtractedDocument } from '@oyl/all-of-oyl'
import { createOllamaEngine } from '../src/ollama-engine.js'
import { createPaddleOcrEngine } from '../src/paddle-ocr-engine.js'
import { loadConfig } from '../src/config.js'
import { processDocument } from '../src/pipeline.js'

const GOLDEN = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'golden')
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

/** Fields scored 1/0 per document by strict equality of their JSON projections. */
const FIELDS = ['docType', 'transactionType', 'date', 'time', 'merchant.name', 'payment.method', 'payment.accountSuffix', 'subtotal', 'tax', 'total'] as const

function project(doc: ExtractedDocument, field: string): unknown {
  const json = doc.toJSON() as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  return field.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], json)
}

const config = loadConfig({ flags: {}, env: process.env, dotenv: '' })
const ocr = await createPaddleOcrEngine()
const structurer = createOllamaEngine({ url: config.ollamaUrl, model: config.model, fetchFn: fetch })
const today = DayKey.from(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone)

const cases = readdirSync(GOLDEN).filter((f) => IMAGE_EXTS.has(extname(f).toLowerCase()))
if (cases.length === 0) {
  console.log(`No golden cases in ${GOLDEN} — see golden/README.md`)
  process.exit(0)
}

const hits = new Map<string, number>(FIELDS.map((f) => [f, 0]))
let scored = 0
let lineItemCountHits = 0

for (const image of cases) {
  const ext = extname(image).toLowerCase()
  const expectedPath = join(GOLDEN, `${basename(image, ext)}.expected.json`)
  if (!existsSync(expectedPath)) {
    console.warn(`skip ${image}: no ${basename(expectedPath)}`)
    continue
  }
  const expected = ExtractedDocument.fromJSON(JSON.parse(readFileSync(expectedPath, 'utf8')))
  const bytes = readFileSync(join(GOLDEN, image))
  const result = await processDocument(
    { bytes, originalName: image, ext: ext.slice(1), mimeType: MIME[ext]! },
    { ocr, structurer, today, name: DEFAULT_NAME_CONFIG, now: () => new Date().toISOString() },
  )
  scored++
  for (const field of FIELDS) {
    if (JSON.stringify(project(result.extraction, field)) === JSON.stringify(project(expected, field))) {
      hits.set(field, hits.get(field)! + 1)
    }
  }
  if (result.extraction.lineItems.length === expected.lineItems.length) lineItemCountHits++
  console.log(`${image}: validation=${result.validation.status}`)
}

console.log(`\nScored ${scored} document(s) with model ${config.model}:`)
for (const field of FIELDS) {
  console.log(`  ${field.padEnd(24)} ${hits.get(field)}/${scored}`)
}
console.log(`  ${'lineItems.count'.padEnd(24)} ${lineItemCountHits}/${scored}`)
