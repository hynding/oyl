import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const PKG = resolve(__dirname, "..")

type Field = {
  type: string
  name: string
  relationKind?: string
  target?: string
  unique?: boolean
}
type ContentType = {
  name: string
  builtin?: string
  names?: { plural?: string }
  options?: { upsertBy?: string }
  fields: Field[]
}
type Ir = { contentTypes: ContentType[] }

const ir = JSON.parse(readFileSync(resolve(PKG, "camis.json"), "utf8")) as Ir
const byName = new Map(ir.contentTypes.map((c) => [c.name, c]))

const BACKED = [
  "Note",
  "Consumption",
  "Account",
  "Transaction",
  "Budget",
  "Measurement",
  "ActivitySession",
  "Goal",
]
const CATALOG = ["Activity", "Consumable", "ConsumableProduct"]

describe("camis.json", () => {
  it("re-importing strapi-oyl reproduces the committed IR byte for byte", () => {
    const out = join(mkdtempSync(join(tmpdir(), "oyl-ir-")), "camis.json")
    execFileSync(
      "pnpm",
      [
        "exec",
        "camis",
        "import",
        "strapi",
        "../strapi-oyl",
        "--upsert-by",
        "recordId",
        "--out",
        out,
      ],
      { cwd: PKG, stdio: "pipe" },
    )
    expect(readFileSync(out, "utf8")).toBe(
      readFileSync(resolve(PKG, "camis.json"), "utf8"),
    )
  })
  it("contains every backed and catalog type with upsertBy recordId", () => {
    for (const name of [...BACKED, ...CATALOG]) {
      expect(byName.get(name)?.options?.upsertBy, name).toBe("recordId")
    }
  })
  it("personal types own via `owner`, catalog types via `creator`, both to the builtin User", () => {
    expect(byName.get("User")?.builtin).toBe("user")
    for (const name of BACKED) {
      const rel = byName.get(name)!.fields.find((f) => f.name === "owner")
      expect(rel, name).toMatchObject({
        type: "relation",
        relationKind: "manyToOne",
        target: "User",
      })
    }
    for (const name of CATALOG) {
      const rel = byName.get(name)!.fields.find((f) => f.name === "creator")
      expect(rel, name).toMatchObject({
        type: "relation",
        relationKind: "manyToOne",
        target: "User",
      })
    }
  })
  it("carries the Strapi plural names the client routes by", () => {
    expect(byName.get("ActivitySession")?.names?.plural).toBe(
      "ActivitySessions",
    )
    expect(byName.get("ConsumableProduct")?.names?.plural).toBe(
      "ConsumableProducts",
    )
  })
})
