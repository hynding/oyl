// Copies src/global/themes/*.css to dist/themes/ so `@oyl/ui-oyl/themes/<name>.css` resolves.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const src = join(root, 'src', 'global', 'themes')
const dest = join(root, 'dist', 'themes')
mkdirSync(dest, { recursive: true })
let n = 0
for (const file of readdirSync(src, { withFileTypes: true })) {
  if (!file.isFile() || !file.name.endsWith('.css')) continue
  copyFileSync(join(src, file.name), join(dest, file.name))
  n++
}
console.log(`copy-themes: ${n} theme file(s) → dist/themes`)
