// Copies the built all-of-oyl ESM into the app's servable vendor/ dir, because
// http-server cannot serve files outside the app root.
import { cp, rm } from 'node:fs/promises'

const src = new URL('../../../packages/all-of-oyl/dist/', import.meta.url)
const dest = new URL('../vendor/all-of-oyl/', import.meta.url)

await rm(dest, { recursive: true, force: true })
await cp(src, dest, { recursive: true })
console.log('Copied all-of-oyl/dist → vendor/all-of-oyl')
