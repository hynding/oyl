import { Buffer } from 'node:buffer'
import { EXTRACTION_JSON_SCHEMA, type FetchFn } from '@oyl/all-of-oyl'

export interface OcrLine {
  text: string
  box?: number[]
}

/** Failures the user can act on (start ollama, pull the model). */
export class OllamaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OllamaError'
  }
}

function buildPrompt(ocrLines: OcrLine[]): string {
  const fields = Object.keys(EXTRACTION_JSON_SCHEMA['properties'] as Record<string, unknown>).join(', ')
  const ocrText = ocrLines.map((l) => l.text).join('\n')
  return [
    'You are reading ONE retail receipt, invoice, or statement image.',
    `Extract exactly these fields as JSON: ${fields}.`,
    'Amounts are decimal strings exactly as printed (e.g. "48.12"). Use null when a value is not printed — never guess.',
    'docType is one of receipt|invoice|statement|other; transactionType one of purchase|refund|payment|other.',
    'The date is YYYY-MM-DD; the time is 24h HH:MM local to the document.',
    '',
    'OCR text of the same image (ground truth for digits and spelling):',
    ocrText,
  ].join('\n')
}

export function createOllamaEngine(opts: { url: string; model: string; fetchFn: FetchFn }) {
  const { url, model, fetchFn } = opts
  return {
    model,
    async extract(image: Uint8Array, ocrLines: OcrLine[]): Promise<unknown> {
      let response: Awaited<ReturnType<FetchFn>>
      try {
        response = await fetchFn(`${url}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            options: { temperature: 0 },
            format: EXTRACTION_JSON_SCHEMA,
            messages: [
              { role: 'user', content: buildPrompt(ocrLines), images: [Buffer.from(image).toString('base64')] },
            ],
          }),
        })
      } catch {
        throw new OllamaError(`Ollama not reachable at ${url} — is it running? Start it with: ollama serve`)
      }
      if (response.status === 404) {
        throw new OllamaError(`Model "${model}" not found on the Ollama server — fetch it with: ollama pull ${model}`)
      }
      if (!response.ok) {
        let bodyText: string
        try {
          bodyText = JSON.stringify(await response.json())
        } catch {
          throw new OllamaError(`Ollama returned ${response.status} with an unreadable body — is ${url} really an Ollama server?`)
        }
        throw new OllamaError(`Ollama returned ${response.status}: ${bodyText}`)
      }
      let payload: { message?: { content?: unknown } }
      try {
        payload = (await response.json()) as { message?: { content?: unknown } }
      } catch {
        throw new OllamaError(`Ollama response was not JSON — is ${url} really an Ollama server?`)
      }
      const content = payload?.message?.content
      if (typeof content !== 'string') throw new OllamaError('Ollama response had no message content')
      try {
        return JSON.parse(content)
      } catch {
        throw new OllamaError(`Ollama returned unparseable JSON despite format enforcement: ${content.slice(0, 200)}`)
      }
    },
  }
}
