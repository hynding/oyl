import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it, afterEach } from "vitest"

const SCRIPT = resolve(__dirname, "..", "..", "..", "scripts", "deploy-dreamhost.sh")
const src = () => readFileSync(SCRIPT, "utf8")
const run = (args: string[], env: Record<string, string>) =>
  spawnSync("bash", [SCRIPT, ...args], { env: { PATH: process.env.PATH ?? "", HOME: "/nonexistent", ...env }, encoding: "utf8" })

describe("scripts/deploy-dreamhost.sh (local wrapper)", () => {
  it("parses", () => {
    expect(() => execFileSync("bash", ["-n", SCRIPT])).not.toThrow()
  })
  it("refuses to run without OYL_DH_SSH and lists every OYL_DH_* key to add to .env", () => {
    const res = run(["--dry-run"], { OYL_DH_SSH: "" })
    expect(res.status).toBe(1)
    for (const k of ["OYL_DH_SSH", "OYL_DH_WWW_ROOT", "OYL_DH_API_ROOT", "OYL_DH_API_BASE", "OYL_DH_SITE_URL", "OYL_DH_API_URL", "OYL_DH_CSP_HEADER"]) {
      expect(res.stderr, k).toContain(k)
    }
    expect(res.stderr).not.toContain("OYL_DH_APP_ROOT")
  })
  it("validates --only", () => {
    let res = run(["--only", "pi"], { OYL_DH_SSH: "x@y" })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("--only")
    res = run(["--only"], { OYL_DH_SSH: "x@y" })
    expect(res.status).toBe(1)
    res = run(["--yolo"], { OYL_DH_SSH: "x@y" })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("unknown argument")
  })
  it("checks for a dirty tree before building or publishing anything, and delegates to the shared publish scripts", () => {
    const s = src()
    const dirty = s.indexOf("git status --porcelain")
    expect(dirty).toBeGreaterThan(-1)
    for (const later of ["pnpm vanilla build:lib", "pnpm php-app build", "dreamhost/publish-www.sh", "dreamhost/publish-api.sh"]) {
      expect(s.indexOf(later), later).toBeGreaterThan(dirty)
    }
    expect(s).not.toContain("rsync ")
    expect(s).not.toContain("composer install")
  })
  it("never sources .env wholesale", () => {
    expect(src()).not.toMatch(/^\s*(source|\.)\s+.*\.env/m)
  })
})

describe("scripts/deploy-dreamhost.sh (behavioural)", () => {
  let tmpDir: string
  let fakebin: string
  let fakeCapture: string

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
  })

  it("refuses to run when git status reports a dirty tree (before building)", () => {
    tmpDir = mkdtempSync("/tmp/deploy-dreamhost-")
    fakebin = resolve(tmpDir, "bin")
    fakeCapture = resolve(tmpDir, "capture")
    mkdirSync(fakebin)

    // Create fake git script: reports dirty tree
    const gitScript = `#!/bin/bash
if [[ "$*" == "status --porcelain" ]]; then
  printf ' M some/file\n'
  exit 0
elif [[ "$*" == "rev-parse --short HEAD" ]]; then
  printf 'abc1234'
  exit 0
fi
exit 0
`
    writeFileSync(resolve(fakebin, "git"), gitScript, { mode: 0o755 })

    // Create fake pnpm script: capture argv
    const pnpmScript = `#!/bin/bash
mkdir -p "$(dirname "$FAKE_CAPTURE/pnpm")"
printf '%s\n' "$@" >> "$FAKE_CAPTURE/pnpm"
exit 0
`
    writeFileSync(resolve(fakebin, "pnpm"), pnpmScript, { mode: 0o755 })

    const res = spawnSync("bash", [SCRIPT, "--dry-run"], {
      env: {
        PATH: `${fakebin}:${process.env.PATH ?? ""}`,
        HOME: "/nonexistent",
        FAKE_CAPTURE: fakeCapture,
        OYL_DH_SSH: "x@y",
        OYL_DH_WWW_ROOT: "www",
        OYL_DH_API_ROOT: "camis",
        OYL_DH_API_BASE: "https://api.example.test/api"
      },
      encoding: "utf8"
    })

    expect(res.status).toBe(1)
    expect(res.stderr).toContain("dirty")
    const captureFile = resolve(fakeCapture, "pnpm")
    try {
      readFileSync(captureFile, "utf8")
      throw new Error("pnpm should not have been called (no build should run on dirty tree)")
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e
      // Expected: file does not exist
    }
  })

  it("builds and delegates to publish-www when tree is clean and --only www", () => {
    tmpDir = mkdtempSync("/tmp/deploy-dreamhost-")
    fakebin = resolve(tmpDir, "bin")
    fakeCapture = resolve(tmpDir, "capture")
    mkdirSync(fakebin)

    // Create fake git script: reports clean tree
    const gitScript = `#!/bin/bash
if [[ "$*" == "status --porcelain" ]]; then
  exit 0
elif [[ "$*" == "rev-parse --short HEAD" ]]; then
  printf 'abc1234'
  exit 0
fi
exit 0
`
    writeFileSync(resolve(fakebin, "git"), gitScript, { mode: 0o755 })

    // Create fake pnpm script: capture argv and succeed
    const pnpmScript = `#!/bin/bash
mkdir -p "$(dirname "$FAKE_CAPTURE/pnpm")"
printf '%s\n' "$@" >> "$FAKE_CAPTURE/pnpm"
exit 0
`
    writeFileSync(resolve(fakebin, "pnpm"), pnpmScript, { mode: 0o755 })

    const res = spawnSync("bash", [SCRIPT, "--dry-run", "--only", "www"], {
      env: {
        PATH: `${fakebin}:${process.env.PATH ?? ""}`,
        HOME: "/nonexistent",
        FAKE_CAPTURE: fakeCapture,
        OYL_DH_SSH: "x@y",
        OYL_DH_WWW_ROOT: "www",
        OYL_DH_API_ROOT: "camis",
        OYL_DH_API_BASE: "https://api.example.test/api"
      },
      encoding: "utf8"
    })

    // The build should have run (and pnpm should be in capture file)
    try {
      const captureFile = resolve(fakeCapture, "pnpm")
      const pnpmOutput = readFileSync(captureFile, "utf8")
      expect(pnpmOutput).toContain("vanilla")
      expect(pnpmOutput).toContain("build:lib")
    } catch (e: any) {
      if (e.code === "ENOENT") {
        throw new Error("pnpm should have been called during build, but capture file does not exist")
      }
      throw e
    }

    // The publish-www delegate should have been invoked
    // It will fail (exit status non-zero) due to missing vendor files or ssh unreachable
    expect(res.status).not.toBe(0)
    const combined = res.stderr + res.stdout
    expect(combined).toContain("publish-www")
  })
})
