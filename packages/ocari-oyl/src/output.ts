import { constants, copyFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface OutputPlan {
  imagePath: string
  sidecarPath: string
}

/** Create the output directory (recursively) if needed; a same-named file is an error, not a silent clobber. */
export function ensureDir(dir: string): void {
  if (existsSync(dir)) {
    if (!statSync(dir).isDirectory()) throw new Error(`not a directory: ${dir}`)
    return
  }
  mkdirSync(dir, { recursive: true })
}

function splitExt(fileName: string): { base: string; ext: string } {
  const dot = fileName.lastIndexOf('.')
  return dot <= 0 ? { base: fileName, ext: '' } : { base: fileName.slice(0, dot), ext: fileName.slice(dot) }
}

/** Backstop far above any real directory's worth of same-named files — a probe that gets here is looping on a bug. */
const MAX_COLLISION_PROBES = 10_000

/** Find collision-free image+sidecar paths sharing one basename; suffix _2, _3, … before the extension. */
export function planOutputs(dir: string, fileName: string, exists: (path: string) => boolean): OutputPlan {
  const { base, ext } = splitExt(fileName)
  for (let n = 1; n <= MAX_COLLISION_PROBES; n++) {
    const candidate = n === 1 ? base : `${base}_${n}`
    const imagePath = join(dir, `${candidate}${ext}`)
    const sidecarPath = join(dir, `${candidate}.json`)
    if (!exists(imagePath) && !exists(sidecarPath)) return { imagePath, sidecarPath }
  }
  throw new Error(`no collision-free name for "${fileName}" in ${dir} after ${MAX_COLLISION_PROBES} attempts`)
}

/** Copy (default) or move the source to its planned name and write the sidecar. Exclusive flags: never overwrites. */
export function writeOutputs(args: {
  sourcePath: string
  plan: OutputPlan
  sidecar: Record<string, unknown>
  rename: boolean
}): void {
  // Early guard: reject if image target already exists (cheap pre-check; exclusive flags remain authoritative for races).
  if (existsSync(args.plan.imagePath)) throw new Error(`target exists: ${args.plan.imagePath}`)

  // Write sidecar first (wx flag claims the basename atomically).
  writeFileSync(args.plan.sidecarPath, `${JSON.stringify(args.sidecar, null, 2)}\n`, { flag: 'wx' })

  try {
    if (args.rename) {
      renameSync(args.sourcePath, args.plan.imagePath)
    } else {
      copyFileSync(args.sourcePath, args.plan.imagePath, constants.COPYFILE_EXCL)
    }
  } catch (err) {
    // Cleanup: if image operation fails, remove the sidecar so no orphan remains.
    try {
      unlinkSync(args.plan.sidecarPath)
    } catch {
      // Ignore cleanup errors; original error takes precedence.
    }
    // Unify the raced-collision surface with the early guard's message (raw EEXIST otherwise).
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`target exists: ${args.plan.imagePath}`)
    }
    throw err
  }
}
