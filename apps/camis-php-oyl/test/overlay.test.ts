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
const money = resolve(OVERLAY, "app/Support/OylMoney.php")
const txController = resolve(
  OVERLAY,
  "app/Http/Controllers/Api/TransactionApiController.php",
)
const budgetController = resolve(
  OVERLAY,
  "app/Http/Controllers/Api/BudgetApiController.php",
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

/**
 * The relation the IR declares from a type to `User` — `owner` on a personal type, `creator`
 * on a catalog one. In the Strapi storage layout `record.ownerId`/`record.creatorId` resolve
 * through a belongsToMany accessor, so every read of them costs a query unless the relation is
 * eager-loaded; the generated `scoped()` loads exactly this relation, and /bootstrap must too.
 */
const userRelation = (ct: ContentType): string | undefined =>
  ct.fields.find(
    (f) =>
      f.type === "relation" &&
      f.target === "User" &&
      (f.relationKind === "manyToOne" || f.relationKind === "oneToOne"),
  )?.name

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

/** Pull the `$owners = [ ... ];` literal's `Model::class => 'relation'` entries. */
const ownersLiteral = (src: string): Map<string, string> => {
  const m = src.match(/\$owners\s*=\s*\[([\s\S]*?)\n\s*\];/)
  if (!m) throw new Error("could not find an `$owners = [ ... ];` literal")
  const entries = new Map<string, string>()
  for (const em of m[1]!.matchAll(/(\w+)::class\s*=>\s*'(\w+)'/g)) {
    entries.set(em[1]!, em[2]!)
  }
  return entries
}

const ir = JSON.parse(readFileSync(resolve(PKG, "camis.json"), "utf8")) as Ir

describe("overlay PHP", () => {
  it.skipIf(!hasPhp())("lints", () => {
    for (const f of [routes, product, money, txController, budgetController])
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
    // …and every one of them is eager-loaded on the relation the per-row `can('view')` reads,
    // so /bootstrap keeps the generated index()'s cost model instead of one query per row.
    const owners = ownersLiteral(src)
    expect(
      new Set(owners.keys()),
      "an $owners entry for every $collections model",
    ).toEqual(new Set(actual.values()))
    for (const ct of backedTypes(ir)) {
      expect(owners.get(ct.name), `${ct.name} eager-load relation`).toBe(
        userRelation(ct),
      )
    }
    expect(src).toContain("->with([$owners[$model]])")
    expect(src).toContain(
      "Route::middleware(StrapiJwtGuard::class)->get('/bootstrap'",
    )
    expect(src).not.toContain("auth:sanctum")
    expect(src).toContain("use App\\Http\\Middleware\\StrapiJwtGuard;")
    expect(src).toContain(
      "StrapiComponents::load($rows, $model::COMPONENT_MAP);",
    )
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

/**
 * strapi-oyl coerces `finance.money`'s `minor` (a Strapi `biginteger`) from the wire string
 * Strapi renders to a JS number, because the domain decoder (`Money.fromJSON`) only accepts a
 * number — see apps/strapi-oyl/src/utils/finance-money.ts. camis emits the stock-Strapi string,
 * so the overlay has to mirror that OYL-specific coercion here.
 */
describe("money minor is a JSON number (mirrors strapi-oyl sanitizeMoney)", () => {
  const php = (code: string): string =>
    execFileSync("php", ["-r", `require '${money}'; ${code}`], {
      encoding: "utf8",
    })

  it.skipIf(!hasPhp())("coerces a biginteger wire string to a number", () => {
    const out = php(
      `echo json_encode(\\App\\Support\\OylMoney::inWire(['recordId' => 'tx-1', 'amount' => ['minor' => '1234', 'currency' => 'USD', 'exponent' => 2]], 'amount'));`,
    )
    expect(JSON.parse(out)).toEqual({
      recordId: "tx-1",
      amount: { minor: 1234, currency: "USD", exponent: 2 },
    })
  })

  it.skipIf(!hasPhp())("leaves a row without that component untouched", () => {
    const out = php(
      `echo json_encode(\\App\\Support\\OylMoney::inWire(['recordId' => 'tx-1'], 'amount'));`,
    )
    expect(JSON.parse(out)).toEqual({ recordId: "tx-1" })
  })

  it.skipIf(!hasPhp())("leaves a non-numeric minor alone", () => {
    const out = php(
      `echo json_encode(\\App\\Support\\OylMoney::inWire(['amount' => ['minor' => 'nope']], 'amount'));`,
    )
    expect(JSON.parse(out)).toEqual({ amount: { minor: "nope" } })
  })

  it("both money-bearing controllers coerce their component on the way out", () => {
    const tx = readFileSync(txController, "utf8")
    expect(tx).toContain("extends Generated")
    expect(tx).toContain("OylMoney::inResponse(")
    expect(tx).toContain("'amount'")
    for (const m of ["index", "show", "store", "update"])
      expect(tx, m).toContain(`parent::${m}(`)

    const budget = readFileSync(budgetController, "utf8")
    expect(budget).toContain("extends Generated")
    expect(budget).toContain("OylMoney::inResponse(")
    expect(budget).toContain("'limit'")
    for (const m of ["index", "show", "store", "update"])
      expect(budget, m).toContain(`parent::${m}(`)
  })

  it("the /bootstrap route coerces both money components too", () => {
    const src = readFileSync(routes, "utf8")
    expect(src).toContain("use App\\Support\\OylMoney;")
    expect(src).toContain("Transaction::class => 'amount'")
    expect(src).toContain("Budget::class => 'limit'")
    expect(src).toContain("OylMoney::inWire(")
  })
})
