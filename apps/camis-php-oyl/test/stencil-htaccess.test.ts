import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { hashInlineScripts } from "../../../scripts/dreamhost/lib/csp-hashes.mjs"
import { renderHtaccess } from "../../../scripts/dreamhost/lib/render-htaccess.mjs"

const ROOT = resolve(__dirname, "..", "..", "..")
const template = readFileSync(resolve(ROOT, "apps", "stencil-oyl", "deploy", "htaccess.template"), "utf8")
// src/index.html's inline script is byte-identical in the built www/index.html (Stencil copies it verbatim).
const html = readFileSync(resolve(ROOT, "apps", "stencil-oyl", "src", "index.html"), "utf8")

describe("apps/stencil-oyl/deploy/htaccess.template", () => {
  it("renders against the app's index.html: one inline-script hash, the scoped fallback, ordered cache rules, no placeholders", async () => {
    const hashes = await hashInlineScripts(html)
    expect(hashes).toHaveLength(1)
    const text = renderHtaccess(template, { header: "Content-Security-Policy", hashes, apiOrigin: "https://api.example.test" })
    expect(text).toContain("RewriteCond %{REQUEST_URI} !^/(build|themes)/")
    expect(text).toContain("RewriteCond %{REQUEST_URI} !^/(tokens\\.css|favicon\\.(svg|ico))$")
    expect(text).toContain("RewriteRule ^ /index.html [L]")
    expect(text).toContain("<Files \"DEPLOYED\">")
    expect(text).toContain("connect-src 'self' https://api.example.test;")
    expect(text).toContain("img-src 'self' data:")
    const generic = text.indexOf("max-age=0, must-revalidate")
    const immutable = text.indexOf("public, max-age=31536000, immutable")
    expect(generic).toBeGreaterThan(-1)
    expect(immutable).toBeGreaterThan(generic)
    expect(text).toContain("Header always set Cache-Control \"no-cache\"")
    expect(text).toContain("Header always set Strict-Transport-Security \"max-age=31536000\"")
    expect(text).not.toMatch(/includeSubDomains|preload/)
    expect(text).not.toMatch(/__[A-Z_]+__/)
  })
  it("the immutable rule matches Stencil's hashed chunks and nothing unhashed", () => {
    const m = /<FilesMatch "([^"]+)">\s*Header always set Cache-Control "public, max-age=31536000, immutable"/.exec(template)
    expect(m).not.toBeNull()
    const re = new RegExp(m![1]!)
    for (const f of ["p-0914ff9e.entry.js", "p-B-9wnX-d.js", "p-4fd6bad2.css"]) expect(re.test(f), f).toBe(true)
    for (const f of ["oyl.esm.js", "oyl.css", "index.esm.js", "oyl.js", "index.html", "tokens.css"]) expect(re.test(f), f).toBe(false)
  })
})
