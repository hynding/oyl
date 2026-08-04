import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Raw contents of the untracked root .env; '' when absent. Parsed per-key by callers, never sourced. */
export function repoDotenv(): string {
  // repo root = three dirs up from packages/ocari-oyl/src
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  const path = join(root, '.env')
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}
