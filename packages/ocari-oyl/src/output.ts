import { constants, copyFileSync, existsSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface OutputPlan {
  imagePath: string
  sidecarPath: string
}

function splitExt(fileName: string): { base: string; ext: string } {
  const dot = fileName.lastIndexOf('.')
  return dot <= 0 ? { base: fileName, ext: '' } : { base: fileName.slice(0, dot), ext: fileName.slice(dot) }
}

/** Find collision-free image+sidecar paths sharing one basename; suffix _2, _3, … before the extension. */
export function planOutputs(dir: string, fileName: string, exists: (path: string) => boolean): OutputPlan {
  const { base, ext } = splitExt(fileName)
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}_${n}`
    const imagePath = join(dir, `${candidate}${ext}`)
    const sidecarPath = join(dir, `${candidate}.json`)
    if (!exists(imagePath) && !exists(sidecarPath)) return { imagePath, sidecarPath }
  }
}

/** Copy (default) or move the source to its planned name and write the sidecar. Exclusive flags: never overwrites. */
export function writeOutputs(args: {
  sourcePath: string
  plan: OutputPlan
  sidecar: Record<string, unknown>
  rename: boolean
}): void {
  if (args.rename) {
    // renameSync would clobber an existing target; probe with the sidecar's exclusive write first.
    writeFileSync(args.plan.sidecarPath, `${JSON.stringify(args.sidecar, null, 2)}\n`, { flag: 'wx' })
    // Guard against races and caller bugs: renameSync would still clobber an existing image
    if (existsSync(args.plan.imagePath)) throw new Error(`target exists: ${args.plan.imagePath}`)
    renameSync(args.sourcePath, args.plan.imagePath)
  } else {
    copyFileSync(args.sourcePath, args.plan.imagePath, constants.COPYFILE_EXCL)
    writeFileSync(args.plan.sidecarPath, `${JSON.stringify(args.sidecar, null, 2)}\n`, { flag: 'wx' })
  }
}
