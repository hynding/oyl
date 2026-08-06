import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { DayKey, DEFAULT_NAME_CONFIG } from '@oyl/all-of-oyl'
import { ConfigError, loadConfig, type ConfigInputs } from './config.js'
import { createOllamaEngine } from './ollama-engine.js'
import { createPaddleOcrEngine } from './paddle-ocr-engine.js'
import { processDocument } from './pipeline.js'
import { ensureDir, planOutputs, writeOutputs } from './output.js'
import { repoDotenv } from './repo-dotenv.js'

const SUPPORTED = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

export function parseCliArgs(argv: string[]): { files: string[]; flags: ConfigInputs['flags']; help: boolean } {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: 'boolean', default: false },
      rename: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      out: { type: 'string' },
      model: { type: 'string' },
      'name-template': { type: 'string' },
      'name-prefix': { type: 'string' },
      'date-format': { type: 'string' },
      'time-format': { type: 'string' },
    },
  })
  const { help, ...rest } = values
  const flags = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as ConfigInputs['flags']
  return { files: positionals, flags, help: help === true }
}

const USAGE = `ocari — parse receipt/invoice/statement images into named copies + JSON data sheets

Usage: pnpm ocari <image...> [--out <dir>] [--rename] [--dry-run] [--model <name>]
                  [--name-template <t>] [--name-prefix <p>] [--date-format <f>] [--time-format <f>]

Template variables: <date> <time> <business> <category> <CATEGORY> <transaction_type>
                    <payment_method> <payment_account_suffix> <total> <ext>
Defaults: template ${DEFAULT_NAME_CONFIG.template} · date ${DEFAULT_NAME_CONFIG.dateFormat} · time ${DEFAULT_NAME_CONFIG.timeFormat}
Env (root .env): OYL_OCARI_OLLAMA_URL OYL_OCARI_MODEL OYL_OCARI_NAME_TEMPLATE OYL_OCARI_NAME_PREFIX OYL_OCARI_DATE_FORMAT OYL_OCARI_TIME_FORMAT

Requires a running Ollama (ollama serve) with the model pulled (ollama pull qwen2.5vl:7b).`

/**
 * Resolve a user-supplied path (a CLI positional or --out) against the invoking shell's cwd,
 * not the process cwd. `pnpm --filter @oyl/ocari-oyl ocari` runs with cwd = packages/ocari-oyl,
 * so a relative path typed at the repo root must resolve against `base` (INIT_CWD), never
 * `process.cwd()`. Absolute paths pass through resolve() unchanged.
 */
export function resolveUserPath(base: string, p: string): string {
  return isAbsolute(p) ? resolve(p) : resolve(base, p)
}

export async function main(argv: string[]): Promise<number> {
  let parsed: ReturnType<typeof parseCliArgs>
  try {
    parsed = parseCliArgs(argv)
  } catch (e) {
    console.error((e as Error).message)
    console.error(USAGE)
    return 2
  }
  if (parsed.help) {
    console.log(USAGE)
    return 0
  }
  if (parsed.files.length === 0) {
    console.error(USAGE)
    return 2
  }

  let config
  try {
    config = loadConfig({ flags: parsed.flags, env: process.env, dotenv: repoDotenv() })
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(`Configuration error:\n${e.message}`)
      return 2
    }
    throw e
  }

  // pnpm sets INIT_CWD to the invoking shell's cwd; process.cwd() under `pnpm --filter` is the package dir.
  const cwd = process.env.INIT_CWD ?? process.cwd()
  const outDir = config.out !== undefined ? resolveUserPath(cwd, config.out) : undefined
  if (outDir !== undefined && !config.dryRun) {
    // Auto-create before paying for engine startup; a same-named file fails fast.
    try {
      ensureDir(outDir)
    } catch (e) {
      console.error(`--out: ${(e as Error).message}`)
      return 2
    }
  }

  const ocr = await createPaddleOcrEngine()
  const structurer = createOllamaEngine({ url: config.ollamaUrl, model: config.model, fetchFn: fetch })
  const today = DayKey.from(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone)

  const rows: { file: string; status: string; detail: string }[] = []
  for (const file of parsed.files) {
    try {
      const resolvedFile = resolveUserPath(cwd, file)
      const ext = extname(file).toLowerCase()
      if (ext === '.heic') throw new Error('HEIC is not supported — convert first (e.g. `sips -s format jpeg`)')
      if (!SUPPORTED.has(ext)) throw new Error(`unsupported extension "${ext}" (jpg/jpeg/png/webp)`)
      const bytes = readFileSync(resolvedFile)
      const result = await processDocument(
        { bytes, originalName: basename(file), ext: ext.slice(1), mimeType: MIME[ext]! },
        { ocr, structurer, today, name: config.name, now: () => new Date().toISOString() },
      )
      const dir = outDir ?? dirname(resolvedFile)
      const plan = planOutputs(dir, result.fileName, existsSync)
      if (config.dryRun) {
        rows.push({ file, status: `${result.validation.status} (dry-run)`, detail: plan.imagePath })
      } else {
        writeOutputs({ sourcePath: resolvedFile, plan, sidecar: result.sidecar, rename: config.rename })
        rows.push({ file, status: result.validation.status, detail: plan.imagePath })
      }
    } catch (e) {
      rows.push({ file, status: 'error', detail: (e as Error).message })
    }
  }

  await ocr.dispose?.()

  const fileWidth = Math.max(...rows.map((r) => r.file.length))
  const statusWidth = Math.max(...rows.map((r) => r.status.length))
  for (const r of rows) console.log(`${r.file.padEnd(fileWidth)}  ${r.status.padEnd(statusWidth)}  ${r.detail}`)
  return rows.every((r) => r.status === 'ok' || r.status.startsWith('ok ')) ? 0 : 1
}

// Direct-run guard: compare the resolved script path rather than building a file:// URL by hand,
// which misbehaves under `tsx` (argv[1] may lack a leading slash normalization the URL ctor expects).
const isDirectRun = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
