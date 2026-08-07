import { describe, expect, it } from 'vitest'
import type { FetchFn } from '@oyl/all-of-oyl'
import { OllamaError, createOllamaEngine } from './ollama-engine.js'

function fakeFetch(status: number, body: unknown): { calls: { url: string; init: Parameters<FetchFn>[1] }[]; fetchFn: FetchFn } {
  const calls: { url: string; init: Parameters<FetchFn>[1] }[] = []
  const fetchFn: FetchFn = async (url, init) => {
    calls.push({ url: String(url), init })
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Awaited<ReturnType<FetchFn>>
  }
  return { calls, fetchFn }
}

/** A response whose json() rejects, e.g. a reverse-proxy HTML error page instead of a JSON body. */
function fakeFetchUnreadableBody(status: number): FetchFn {
  return async () => {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0')
      },
    } as Awaited<ReturnType<FetchFn>>
  }
}

const image = new Uint8Array([1, 2, 3])
const lines = [{ text: 'TRADER JOES' }, { text: 'TOTAL 48.12' }]

describe('createOllamaEngine', () => {
  it('POSTs the structured-output request', async () => {
    const { calls, fetchFn } = fakeFetch(200, { message: { content: '{"docType":"receipt"}' } })
    const engine = createOllamaEngine({ url: 'http://localhost:11434', model: 'qwen2.5vl:7b', fetchFn })
    const result = await engine.extract(image, lines)
    expect(result).toEqual({ docType: 'receipt' })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('http://localhost:11434/api/chat')
    const sent = JSON.parse(String(calls[0]!.init?.body))
    expect(sent.model).toBe('qwen2.5vl:7b')
    expect(sent.stream).toBe(false)
    expect(sent.options).toEqual({ temperature: 0 })
    expect(sent.format.type).toBe('object') // EXTRACTION_JSON_SCHEMA passed through
    expect(sent.messages).toHaveLength(1)
    expect(sent.messages[0].images).toEqual([Buffer.from(image).toString('base64')])
    expect(sent.messages[0].content).toContain('TOTAL 48.12') // OCR text embedded
    expect(sent.messages[0].content).toContain('docType') // schema restated in prompt
  })

  it('maps connection refusal to an actionable error', async () => {
    const fetchFn: FetchFn = async () => {
      throw new TypeError('fetch failed')
    }
    const engine = createOllamaEngine({ url: 'http://localhost:11434', model: 'qwen2.5vl:7b', fetchFn })
    await expect(engine.extract(image, lines)).rejects.toThrowError(OllamaError)
    await expect(engine.extract(image, lines)).rejects.toThrowError(/ollama serve|not reachable/i)
  })

  it('maps a missing-model 404 to a pull hint', async () => {
    const { fetchFn } = fakeFetch(404, { error: 'model not found' })
    const engine = createOllamaEngine({ url: 'http://localhost:11434', model: 'qwen2.5vl:7b', fetchFn })
    await expect(engine.extract(image, lines)).rejects.toThrowError(/ollama pull qwen2\.5vl:7b/)
  })

  it('maps a 404 without a model error to a wrong-base-URL hint', async () => {
    const { fetchFn } = fakeFetch(404, { message: 'route not matched' })
    const engine = createOllamaEngine({ url: 'http://localhost:11434/api', model: 'qwen2.5vl:7b', fetchFn })
    await expect(engine.extract(image, lines)).rejects.toThrowError(/OYL_OCARI_OLLAMA_URL/)
  })

  it('preserves the underlying fetch failure in the not-reachable message', async () => {
    const fetchFn: FetchFn = async () => {
      throw new TypeError('connect ECONNREFUSED 127.0.0.1:11434')
    }
    const engine = createOllamaEngine({ url: 'http://localhost:11434', model: 'qwen2.5vl:7b', fetchFn })
    await expect(engine.extract(image, lines)).rejects.toThrowError(/ECONNREFUSED/)
  })

  it('rejects unparseable content', async () => {
    const { fetchFn } = fakeFetch(200, { message: { content: 'not json' } })
    const engine = createOllamaEngine({ url: 'http://localhost:11434', model: 'qwen2.5vl:7b', fetchFn })
    await expect(engine.extract(image, lines)).rejects.toThrowError(OllamaError)
  })

  it('maps a plain 500 with a JSON body to an actionable status+body message', async () => {
    const { fetchFn } = fakeFetch(500, { error: 'internal server error' })
    const engine = createOllamaEngine({ url: 'http://localhost:11434', model: 'qwen2.5vl:7b', fetchFn })
    await expect(engine.extract(image, lines)).rejects.toThrowError(OllamaError)
    await expect(engine.extract(image, lines)).rejects.toThrowError(/500/)
    await expect(engine.extract(image, lines)).rejects.toThrowError(/internal server error/)
  })

  it('maps a non-OK response with an unreadable (non-JSON) body to an actionable OllamaError', async () => {
    const fetchFn = fakeFetchUnreadableBody(500)
    const engine = createOllamaEngine({ url: 'http://localhost:11434', model: 'qwen2.5vl:7b', fetchFn })
    await expect(engine.extract(image, lines)).rejects.toThrowError(OllamaError)
    await expect(engine.extract(image, lines)).rejects.toThrowError(/500/)
  })

  it('maps a 200 with an unreadable (non-JSON) body to an actionable OllamaError, not a raw SyntaxError', async () => {
    const fetchFn = fakeFetchUnreadableBody(200)
    const engine = createOllamaEngine({ url: 'http://localhost:11434', model: 'qwen2.5vl:7b', fetchFn })
    await expect(engine.extract(image, lines)).rejects.toThrowError(OllamaError)
    await expect(engine.extract(image, lines)).rejects.not.toThrowError(SyntaxError)
  })
})
