import { createHash } from 'node:crypto'
import {
  DayKey,
  ExtractedDocument,
  extractionFromLlm,
  renderFileName,
  validateExtraction,
  type NameConfig,
  type ValidationReport,
} from '@oyl/all-of-oyl'
import type { OcrLine } from './ollama-engine.js'

export interface OcrEngine {
  readonly name: string
  recognize(image: Uint8Array): Promise<OcrLine[]>
  /** Release engine resources (e.g. ONNX sessions); optional — one-shot CLI runs may rely on process exit. */
  dispose?(): Promise<void> | void
}

export interface StructuringEngine {
  readonly model: string
  extract(image: Uint8Array, ocrLines: OcrLine[]): Promise<unknown>
}

export interface DocInput {
  bytes: Uint8Array
  originalName: string
  ext: string
  mimeType: string
}

export interface DocResult {
  extraction: ExtractedDocument
  validation: ValidationReport
  /** Rendered name before collision suffixing (output layer's job). */
  fileName: string
  sidecar: Record<string, unknown>
}

export interface PipelineDeps {
  ocr: OcrEngine
  structurer: StructuringEngine
  today: DayKey
  name: NameConfig
  /** Injected clock (ISO string) so sidecars are testable. */
  now: () => string
}

export async function processDocument(input: DocInput, deps: PipelineDeps): Promise<DocResult> {
  const ocrLines = await deps.ocr.recognize(input.bytes)
  const raw = await deps.structurer.extract(input.bytes, ocrLines)
  const extraction = extractionFromLlm(raw)

  const report = validateExtraction(extraction, { today: deps.today })
  const { name: fileName, missing } = renderFileName(extraction, input.ext, deps.name)
  // Invariant: a filename containing 'unknown' must never ship as status ok.
  // Today, missing variables (date/business/total) exactly mirror requiredFieldsPresent failures,
  // so this branch is defensive. It ensures the invariant holds even if validators or template
  // variables evolve independently. Currently unreachable via public API (missing ⊆ validation fails).
  const validation: ValidationReport =
    missing.length > 0 && report.status === 'ok' ? { ...report, status: 'needs_review' } : report

  const sidecar: Record<string, unknown> = {
    version: 1,
    source: {
      originalName: input.originalName,
      sha256: createHash('sha256').update(input.bytes).digest('hex'),
      mimeType: input.mimeType,
    },
    extraction: extraction.toJSON(),
    ocr: { engine: deps.ocr.name, lines: ocrLines },
    validation,
    engine: { model: deps.structurer.model, createdAt: deps.now() },
  }

  return { extraction, validation, fileName, sidecar }
}
