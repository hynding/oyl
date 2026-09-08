import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const OVERLAY = resolve(__dirname, "..", "overlay")
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

/** REST plural path → generated model, mirroring PATH_BY_COLLECTION for the backed collections. */
const BOOTSTRAP = {
  notes: "Note",
  consumptions: "Consumption",
  transactions: "Transaction",
  measurements: "Measurement",
  "activity-sessions": "ActivitySession",
  accounts: "Account",
  budgets: "Budget",
  goals: "Goal",
  activities: "Activity",
  consumables: "Consumable",
  "consumable-products": "ConsumableProduct",
}

describe("overlay PHP", () => {
  it.skipIf(!hasPhp())("lints", () => {
    for (const f of [routes, product])
      expect(execFileSync("php", ["-l", f], { encoding: "utf8" })).toContain(
        "No syntax errors",
      )
  })
  it("bootstrap serves every backed collection under its REST plural path", () => {
    const src = readFileSync(routes, "utf8")
    for (const [path, model] of Object.entries(BOOTSTRAP)) {
      expect(src, path).toContain(`'${path}' => ${model}::class`)
    }
    expect(src).toContain("Route::middleware('auth:sanctum')->get('/bootstrap'")
    expect(src).toContain("Route::get('/google/config'")
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
