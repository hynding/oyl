import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { entitiesByKind } from "@oyl/all-of-oyl"
import {
  kindsKey,
  restPath,
  type ContentType,
  type Ir,
} from "../scripts/generate-roles.js"

const PKG = resolve(__dirname, "..")
const OVERLAY = resolve(PKG, "overlay")
const routes = resolve(OVERLAY, "routes/api-custom.php")
const product = resolve(
  OVERLAY,
  "app/Http/Controllers/Api/ConsumableProductApiController.php",
)

const hasPhp = (): boolean => {
  try {
    execFileSync("php", ["--version"], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

const PERSONAL = new Set<string>(entitiesByKind("personal"))
const CATALOG = new Set<string>(entitiesByKind("catalog"))

const ownerRelation = (ct: ContentType, name: "owner" | "creator"): boolean =>
  ct.fields.some(
    (f) =>
      f.type === "relation" &&
      f.name === name &&
      f.relationKind === "manyToOne" &&
      f.target === "User",
  )
const isOwnedOrCreated = (ct: ContentType): boolean =>
  ownerRelation(ct, "owner") || ownerRelation(ct, "creator")

/**
 * Every non-builtin content type the /bootstrap endpoint must serve: any type with an
 * `owner`/`creator` manyToOne→User relation (personal write scope or catalog visibility).
 */
const backedTypes = (ir: Ir): ContentType[] =>
  ir.contentTypes.filter(
    (ct) => ct.builtin === undefined && isOwnedOrCreated(ct),
  )
const backedEntries = (ir: Ir): [path: string, model: string][] =>
  backedTypes(ir).map((ct) => [restPath(ct), ct.name])

/** Pull the `$collections = [ ... ];` literal's `'path' => Model::class` entries. */
const collectionsLiteral = (src: string): Map<string, string> => {
  const m = src.match(/\$collections\s*=\s*\[([\s\S]*?)\n\s*\];/)
  if (!m) throw new Error("could not find a `$collections = [ ... ];` literal")
  const entries = new Map<string, string>()
  for (const em of m[1]!.matchAll(/'([\w-]+)'\s*=>\s*(\w+)::class/g)) {
    entries.set(em[1]!, em[2]!)
  }
  return entries
}

const ir = JSON.parse(readFileSync(resolve(PKG, "camis.json"), "utf8")) as Ir

describe("overlay PHP", () => {
  it.skipIf(!hasPhp())("lints", () => {
    for (const f of [routes, product])
      expect(execFileSync("php", ["-l", f], { encoding: "utf8" })).toContain(
        "No syntax errors",
      )
  })
  it("bootstrap's $collections is exactly every backed collection derived from camis.json — no missing entry, no stale one", () => {
    const src = readFileSync(routes, "utf8")
    const actual = collectionsLiteral(src)
    const expected = new Map(backedEntries(ir))
    expect(new Set(actual.keys()), "no stale/extra entries").toEqual(
      new Set(expected.keys()),
    )
    for (const [path, model] of expected) {
      expect(actual.get(path), path).toBe(model)
    }
    // Cross-check: every backed type is registered in @oyl/all-of-oyl's KINDS as the kind
    // matching its relation (owner → personal, creator → catalog) — the same classification
    // generate-roles.ts relies on for roles.json.
    for (const ct of backedTypes(ir)) {
      const key = kindsKey(ct)
      const kind = ownerRelation(ct, "owner") ? "personal" : "catalog"
      expect(
        kind === "personal" ? PERSONAL : CATALOG,
        `${ct.name} (${key})`,
      ).toContain(key)
    }
    expect(src).toContain(
      "Route::middleware(StrapiJwtGuard::class)->get('/bootstrap'",
    )
    expect(src).not.toContain("auth:sanctum")
    expect(src).toContain("use App\\Http\\Middleware\\StrapiJwtGuard;")
    expect(src).toContain("StrapiComponents::load($rows, $model::COMPONENT_MAP);")
    expect(src).toContain("Route::get('/google/config'")
  })
  it("the guard bites: an owned content type absent from $collections fails the comparison", () => {
    const src = readFileSync(routes, "utf8")
    const actual = collectionsLiteral(src)
    const rogueIr: Ir = {
      ...ir,
      contentTypes: [
        ...ir.contentTypes,
        {
          name: "Widget",
          kind: "collection",
          names: { plural: "Widgets" },
          fields: [
            {
              type: "relation",
              name: "owner",
              relationKind: "manyToOne",
              target: "User",
            },
          ],
        },
      ],
    }
    const expectedWithRogue = new Map(backedEntries(rogueIr))
    expect(expectedWithRogue.has("widgets")).toBe(true)
    expect(() =>
      expect(new Set(actual.keys())).toEqual(new Set(expectedWithRogue.keys())),
    ).toThrow()
  })
  it("the product override extends the generated base and handles upc", () => {
    const src = readFileSync(product, "utf8")
    expect(src).toContain("extends Generated")
    expect(src).toContain("where('upc', $upc)")
    expect(src).toContain("parent::store(")
    expect(src).toContain("parent::update(")
    expect(src).toContain("'visibility' => 'public'")
    expect(src).toContain(
      "ConsumableProductSerializer::toWire($existing)], 200)",
    )
  })
})
