import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  generateRoles,
  type Grant,
  type Ir,
} from "../scripts/generate-roles.js"

const PKG = resolve(__dirname, "..")
const ir = JSON.parse(readFileSync(resolve(PKG, "camis.json"), "utf8")) as Ir
const committed = readFileSync(resolve(PKG, "roles.json"), "utf8")
const generated = generateRoles(ir)
const grants = generated.roles[0]!.grants
const byType = (name: string): Grant[] =>
  grants.filter((g) => g.contentType === name)

describe("roles.json", () => {
  it("is exactly what generate-roles produces (no drift)", () => {
    expect(committed).toBe(`${JSON.stringify(generated, null, 2)}\n`)
  })
  it("has one role, authenticated, which is the default", () => {
    expect(generated.defaultRole).toBe("authenticated")
    expect(generated.roles.map((r) => r.name)).toEqual(["authenticated"])
  })
  it("personal types get all four actions under owner == user with owner assigned", () => {
    for (const name of [
      "Note",
      "Consumption",
      "Account",
      "Transaction",
      "Budget",
      "Measurement",
      "ActivitySession",
      "Goal",
    ]) {
      const g = byType(name)
      expect(g, name).toHaveLength(1)
      expect(g[0]).toMatchObject({
        actions: ["create", "read", "update", "delete"],
        condition: {
          kind: "eq",
          left: { kind: "var", name: "record.ownerId" },
          right: { kind: "var", name: "user.id" },
        },
        assign: { owner: "user.id" },
      })
    }
  })
  it("catalog types read public-or-mine but write only their own", () => {
    for (const name of ["Activity", "Consumable", "ConsumableProduct"]) {
      const g = byType(name)
      expect(g, name).toHaveLength(2)
      expect(g[0]).toMatchObject({
        actions: ["read"],
        condition: { kind: "or" },
      })
      expect(g[0]!.assign).toBeUndefined()
      expect(g[1]).toMatchObject({
        actions: ["create", "update", "delete"],
        condition: {
          kind: "eq",
          left: { kind: "var", name: "record.creatorId" },
          right: { kind: "var", name: "user.id" },
        },
        assign: { creator: "user.id" },
      })
    }
  })
  it("types without an owner or creator relation get no grant", () => {
    expect(byType("GoogleAccount")).toEqual([])
    expect(byType("User")).toEqual([])
  })
  it("throws when an owned type has no KINDS entry", () => {
    const rogue: Ir = {
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
    expect(() => generateRoles(rogue)).toThrow(/Widget.*widgets.*KINDS/)
  })
})
