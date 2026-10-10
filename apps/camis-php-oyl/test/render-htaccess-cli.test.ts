import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const CLI = resolve(__dirname, "..", "..", "..", "scripts", "dreamhost", "render-htaccess.mjs")
const TEMPLATE = [
  "RewriteCond %{REQUEST_URI} !^/(build|themes)/",
  "Header always set __CSP_HEADER__ \"script-src 'self' __CSP_SCRIPT_HASHES__; connect-src 'self' __API_ORIGIN__\"",
  "",
].join("\n")
const HTML = "<!doctype html><html><head><script>(function(){})()</script><script type=\"module\" src=\"/build/p-1.js\"></script></head></html>"

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "htaccess-cli-"))
  writeFileSync(join(dir, "htaccess.template"), TEMPLATE)
  writeFileSync(join(dir, "index.html"), HTML)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const render = (args: string[], base = ["--template", join(dir, "htaccess.template"), "--html", join(dir, "index.html"), "--out", join(dir, ".htaccess")]) => {
  execFileSync("node", [CLI, ...base, ...args], { stdio: "pipe" })
  return readFileSync(join(dir, ".htaccess"), "utf8")
}

describe("scripts/dreamhost/render-htaccess.mjs", () => {
  it("renders the template with one hash per inline script, the header name and the api origin", () => {
    const text = render(["--api-origin", "https://api.example.test"])
    expect(text.match(/'sha256-[A-Za-z0-9+/=]+'/g)).toHaveLength(1)
    expect(text).toContain("Header always set Content-Security-Policy \"")
    expect(text).toContain("connect-src 'self' https://api.example.test\"")
    expect(text).not.toMatch(/__[A-Z_]+__/)
  })
  it("honours --csp-header Content-Security-Policy-Report-Only", () => {
    expect(render(["--api-origin", "https://api.example.test", "--csp-header", "Content-Security-Policy-Report-Only"]))
      .toContain("Header always set Content-Security-Policy-Report-Only \"")
  })
  it("requires --template, --html, --api-origin, --out; rejects an origin with a path", () => {
    expect(() => execFileSync("node", [CLI, "--html", join(dir, "index.html"), "--out", join(dir, "x"), "--api-origin", "https://a.test"], { stdio: "pipe" })).toThrow(/--template is required/)
    expect(() => render([])).toThrow(/--api-origin is required/)
    expect(() => render(["--api-origin", "https://api.example.test/api"])).toThrow(/origin/)
  })
  it("rejects a flag given as a value and a repeated flag", () => {
    expect(() => render(["--api-origin", "--csp-header", "Content-Security-Policy"])).toThrow(/--api-origin needs a value/)
    expect(() => render(["--api-origin", "https://a.test", "--api-origin", "https://b.test"])).toThrow(/duplicate argument --api-origin/)
  })
})
