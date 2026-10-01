import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = resolve(__dirname, "..", "..", "..")
const yml = readFileSync(resolve(ROOT, ".github", "workflows", "deploy.yml"), "utf8")
const rootPkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { engines?: { node?: string } }

describe(".github/workflows/deploy.yml", () => {
  it("deploys on push to master and on manual dispatch only", () => {
    expect(yml).toMatch(/on:\s*\n\s+push:\s*\n\s+branches:\s*\[master\]\s*\n\s+workflow_dispatch:/)
    expect(yml).not.toMatch(/pull_request/)
    expect(yml).not.toMatch(/branches:\s*\[main\]/)
  })
  it("serialises deploys instead of cancelling an rsync mid-flight", () => {
    expect(yml).toMatch(/concurrency:\s*\n\s+group: deploy\s*\n\s+cancel-in-progress: false/)
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
  it("gates on tests + typecheck (after strapi build, with PHP available) before any SSH step", () => {
    const i = (s: string) => { const k = yml.indexOf(s); expect(k, s).toBeGreaterThan(-1); return k }
    expect(i("shivammathur/setup-php")).toBeLessThan(i("run: pnpm test"))
    expect(i("run: pnpm strapi-app build")).toBeLessThan(i("run: pnpm test"))
    expect(i("run: pnpm test")).toBeLessThan(i("run: pnpm typecheck"))
    expect(i("run: pnpm typecheck")).toBeLessThan(i("webfactory/ssh-agent"))
    expect(i("webfactory/ssh-agent")).toBeLessThan(i("publish-www.sh"))
    expect(i("webfactory/ssh-agent")).toBeLessThan(i("publish-api.sh"))
  })
  it("path filters: the shared core triggers both targets; each target's publish script and the workflow itself are included", () => {
    const www = yml.slice(yml.indexOf("www:\n"), yml.indexOf("api:\n"))
    const api = yml.slice(yml.indexOf("api:\n"), yml.indexOf("- id: targets"))
    for (const block of [www, api]) {
      expect(block).toContain("'packages/all-of-oyl/**'")
      expect(block).toContain("'pnpm-lock.yaml'")
      expect(block).toContain("'.github/workflows/deploy.yml'")
    }
    expect(www).toContain("'apps/vanilla-oyl/**'")
    expect(www).toContain("'scripts/dreamhost/publish-www.sh'")
    expect(api).toContain("'apps/camis-php-oyl/**'")
    expect(api).toContain("'apps/strapi-oyl/src/api/**'")
    expect(api).toContain("'apps/strapi-oyl/src/components/**'")
    expect(api).toContain("'scripts/dreamhost/publish-api.sh'")
  })
  it("pins the host key from a secret and never disables host-key checking; no secret is echoed", () => {
    expect(yml).toContain("secrets.DH_KNOWN_HOSTS")
    expect(yml).toContain("known_hosts")
    expect(yml).not.toContain("StrictHostKeyChecking=no")
    expect(yml).not.toMatch(/echo[^\n]*secrets\.DH_SSH_KEY/)
  })
  it("maps every DH_* input the publish scripts read", () => {
    for (const v of ["DH_SSH", "DH_WWW_ROOT", "DH_API_ROOT", "DH_API_BASE", "DH_SITE_URL", "DH_API_URL", "DH_CSP_HEADER"]) {
      expect(yml, v).toMatch(new RegExp(`${v}: \\$\\{\\{ (secrets|vars)\\.${v} \\}\\}`))
    }
    expect(yml).not.toMatch(/OYL_DH_/)
  })
})
