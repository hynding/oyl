import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { PaddleOcrService, type Box, type RecognitionResult } from 'ppu-paddle-ocr'
import type { OcrEngine } from './pipeline.js'
import type { OcrLine } from './ollama-engine.js'

// ppu-paddle-ocr's package.json has no "./package.json" entry in its `exports` map,
// so `require('ppu-paddle-ocr/package.json')` is blocked — resolve the package root
// from its main entry instead and read the file directly.
const require = createRequire(import.meta.url)
const packageRoot = dirname(require.resolve('ppu-paddle-ocr'))
const { version } = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { version: string }

/** Union of a line's word boxes into one enclosing box, as `[x, y, width, height]`. */
function unionBox(boxes: Box[]): number[] {
  const left = Math.min(...boxes.map((b) => b.x))
  const top = Math.min(...boxes.map((b) => b.y))
  const right = Math.max(...boxes.map((b) => b.x + b.width))
  const bottom = Math.max(...boxes.map((b) => b.y + b.height))
  return [left, top, right - left, bottom - top]
}

/** A detected text line, as recognized words left-to-right. */
function toOcrLine(words: RecognitionResult[]): OcrLine {
  const text = words.map((w) => w.text).join(' ')
  const boxes = words.map((w) => w.box)
  return boxes.length > 0 ? { text, box: unionBox(boxes) } : { text }
}

/**
 * Thin adapter: ppu-paddle-ocr detection+recognition → OcrLine[].
 * Correctness is covered by `pnpm --filter @oyl/ocari-oyl eval`, not unit tests
 * (model files download on first use — never invoked from `pnpm test`).
 */
export async function createPaddleOcrEngine(): Promise<OcrEngine> {
  const service = new PaddleOcrService()
  await service.initialize()
  return {
    name: `ppu-paddle-ocr@${version}`,
    async recognize(image: Uint8Array): Promise<OcrLine[]> {
      const buffer = image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength) as ArrayBuffer
      const result = await service.recognize(buffer)
      return result.lines.map(toOcrLine)
    },
  }
}
