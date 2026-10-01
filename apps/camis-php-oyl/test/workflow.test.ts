import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = resolve(__dirname, "..", "..", "..")
const yml = readFileSync(resolve(ROOT, ".github", "workflows", "deploy.yml"), "utf8")
const rootPkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { engines?: { node?: string } }

/**
 * Walks `run: |` block scalars and reports whether any line inside one references a raw
 * `${{ secrets.… }}` expression (secrets must be piped in via `env:`, never interpolated
 * directly into a shell command where they could end up echoed/logged).
 */
function runBlockLeaksSecret(text: string): boolean {
  const lines = text.split("\n")
  let inRun = false
  let runIndent = 0
  for (const line of lines) {
    if (!inRun) {
      const start = /^(\s+)run: \|/.exec(line)
      if (start) {
        inRun = true
        runIndent = start[1].length
      }
      continue
    }
    if (line.trim() === "") continue
    const indent = /^(\s*)/.exec(line)![1].length
    if (indent <= runIndent) {
      inRun = false
      const start = /^(\s+)run: \|/.exec(line)
      if (start) {
        inRun = true
        runIndent = start[1].length
      }
      continue
    }
    if (line.includes("${{ secrets.")) return true
  }
  return false
}

describe("runBlockLeaksSecret", () => {
  it("detects a secret after a blank line inside a run: | block", () => {
    const sample = [
      "      - name: Something",
      "        run: |",
      "          echo start",
      "",
      "          echo ${{ secrets.NOPE }}",
    ].join("\n")
    expect(runBlockLeaksSecret(sample)).toBe(true)
  })
  it("ignores a secret that appears only in a step-level env:, outside any run: block", () => {
    const sample = [
      "      - name: Something",
      "        env:",
      "          TOKEN: ${{ secrets.NOPE }}",
      "        run: |",
      "          echo hi",
    ].join("\n")
    expect(runBlockLeaksSecret(sample)).toBe(false)
  })
  it("still closes the block at the next dedented step, not leaking a later with: secret", () => {
    const sample = [
      "      - name: Something",
      "        run: |",
      "          echo hi",
      "      - name: Next step",
      "        uses: foo/bar@0000000000000000000000000000000000000000",
      "        with:",
      "          token: ${{ secrets.X }}",
    ].join("\n")
    expect(runBlockLeaksSecret(sample)).toBe(false)
  })
})

describe(".github/workflows/deploy.yml", () => {
  it("deploys on push to master and on manual dispatch only", () => {
    expect(yml).toMatch(/^on:\n  push:\n    branches: \[master\]\n  workflow_dispatch:\n(\n|[^\s])/m)
    expect(yml).not.toMatch(/pull_request/)
    expect(yml).not.toMatch(/branches:\s*\[main\]/)
  })
  it("serialises deploys instead of cancelling an rsync mid-flight", () => {
    expect(yml).toMatch(/concurrency:\s*\n\s+group: deploy\s*\n\s+cancel-in-progress: false/)
  })
  it("runs with read-only token permissions", () => {
    expect(yml).toMatch(/^permissions:\n  contents: read\n/m)
  })
  it("pins Node 22 in both the workflow and root package.json#engines.node", () => {
    expect(rootPkg.engines?.node).toBe("22.x")
    expect(yml).toMatch(/NODE_VERSION: ['"]22['"]/)
    expect(yml).toContain("node-version: ${{ env.NODE_VERSION }}")
  })
  it("pins hynding/camis to a full 40-hex SHA (branch names and short SHAs cannot be fetched by CI)", () => {
    const m = /CAMIS_REF:\s*([0-9a-f]+)\s*$/m.exec(yml)
    expect(m, "CAMIS_REF missing").not.toBeNull()
    expect(m![1]).toMatch(/^[0-9a-f]{40}$/)
    expect(yml).toContain('git fetch --depth 1 origin "$CAMIS_REF"')
  })
  it("pins every third-party action by commit SHA", () => {
    const matches = yml.matchAll(/uses: ([^@\s]+)@(\S+)/g)
    let count = 0
    for (const m of matches) {
      count++
      expect(m[2], `${m[1]}@${m[2]}`).toMatch(/^[0-9a-f]{40}$/)
    }
    expect(count).toBeGreaterThan(0)
  })
  it("gates on tests + typecheck (after strapi build, with PHP available) before any SSH step", () => {
    const i = (s: string) => { const k = yml.indexOf(s); expect(k, s).toBeGreaterThan(-1); return k }
    expect(i("shivammathur/setup-php")).toBeLessThan(i("run: pnpm test"))
    expect(i("run: pnpm strapi-app build")).toBeLessThan(i("run: pnpm test"))
    expect(i("run: pnpm test")).toBeLessThan(i("run: pnpm typecheck"))
    expect(i("run: pnpm typecheck")).toBeLessThan(i("webfactory/ssh-agent"))
    expect(i("webfactory/ssh-agent")).toBeLessThan(i("bash scripts/dreamhost/publish-api.sh"))
  })
  it("deploys both targets on every run, api before www", () => {
    const i = (s: string) => { const k = yml.indexOf(s); expect(k, s).toBeGreaterThan(-1); return k }
    expect(i("bash scripts/dreamhost/publish-api.sh")).toBeLessThan(i("bash scripts/dreamhost/publish-www.sh"))
    expect(yml).not.toContain("steps.targets")
    expect(yml).not.toContain("paths-filter")
  })
  it("pins the host key from a secret and never disables host-key checking; no secret is echoed", () => {
    expect(yml).toContain("secrets.DH_KNOWN_HOSTS")
    expect(yml).toContain("known_hosts")
    expect(yml).not.toContain("StrictHostKeyChecking=no")
    expect(yml).not.toMatch(/echo[^\n]*secrets\.DH_SSH_KEY/)
    expect(runBlockLeaksSecret(yml)).toBe(false)
  })
  it("maps every DH_* input the publish scripts read", () => {
    for (const v of ["DH_SSH", "DH_WWW_ROOT", "DH_API_ROOT", "DH_API_BASE", "DH_SITE_URL", "DH_API_URL", "DH_CSP_HEADER"]) {
      expect(yml, v).toMatch(new RegExp(`${v}: \\$\\{\\{ (secrets|vars)\\.${v} \\}\\}`))
    }
    expect(yml).not.toMatch(/OYL_DH_/)
  })
})
