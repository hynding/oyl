/**
 * roles.json for the camis-generated backend, derived from @oyl/all-of-oyl's KINDS so a
 * content type added to strapi-oyl + collections.ts needs no hand edit here.
 *
 *   personal → create/read/update/delete where record.ownerId == user.id, owner assigned
 *   catalog  → read where visibility == "public" || creatorId == user.id;
 *              create/update/delete where creatorId == user.id, creator assigned
 *   no owner/creator relation (GoogleAccount, builtin User) → no grant
 *
 * Run: pnpm php-app roles   (also chained after `pnpm php-app import`)
 */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { entitiesByKind } from "@oyl/all-of-oyl"

export type Expression =
  | { kind: "lit"; value: string | number | boolean | null }
  | { kind: "var"; name: string }
  | { kind: "eq"; left: Expression; right: Expression }
  | { kind: "or"; args: Expression[] }
export type Grant = {
  contentType: string
  actions: ("create" | "read" | "update" | "delete")[]
  condition: Expression
  assign?: Record<string, "user.id">
}
export type RolesFile = {
  defaultRole: "authenticated"
  roles: { name: "authenticated"; grants: Grant[] }[]
}
export type Field = {
  type: string
  name: string
  relationKind?: string
  target?: string
}
export type ContentType = {
  name: string
  kind: string
  builtin?: string
  names?: { plural?: string }
  fields: Field[]
}
export type Ir = { contentTypes: ContentType[] }

const PERSONAL = new Set<string>(entitiesByKind("personal"))
const CATALOG = new Set<string>(entitiesByKind("catalog"))

const kebab = (s: string): string =>
  s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()
const camel = (s: string): string =>
  s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
/** IR type → KINDS key: `ActivitySessions` → `activity-sessions` → `activitySessions`. */
export const kindsKey = (ct: ContentType): string =>
  camel(kebab(ct.names?.plural ?? `${ct.name}s`))

const v = (name: string): Expression => ({ kind: "var", name })
const eqUser = (fk: string): Expression => ({
  kind: "eq",
  left: v(`record.${fk}Id`),
  right: v("user.id"),
})
const publicOrMine: Expression = {
  kind: "or",
  args: [
    {
      kind: "eq",
      left: v("record.visibility"),
      right: { kind: "lit", value: "public" },
    },
    eqUser("creator"),
  ],
}

const ownerRelation = (ct: ContentType, name: "owner" | "creator"): boolean =>
  ct.fields.some(
    (f) =>
      f.type === "relation" &&
      f.name === name &&
      f.relationKind === "manyToOne" &&
      f.target === "User",
  )

export function generateRoles(ir: Ir): RolesFile {
  const grants: Grant[] = []
  for (const ct of ir.contentTypes) {
    if (ct.builtin !== undefined) continue
    const owned = ownerRelation(ct, "owner")
    const created = ownerRelation(ct, "creator")
    if (!owned && !created) continue
    const key = kindsKey(ct)
    if (PERSONAL.has(key) && owned) {
      grants.push({
        contentType: ct.name,
        actions: ["create", "read", "update", "delete"],
        condition: eqUser("owner"),
        assign: { owner: "user.id" },
      })
    } else if (CATALOG.has(key) && created) {
      grants.push({
        contentType: ct.name,
        actions: ["read"],
        condition: publicOrMine,
      })
      grants.push({
        contentType: ct.name,
        actions: ["create", "update", "delete"],
        condition: eqUser("creator"),
        assign: { creator: "user.id" },
      })
    } else {
      throw new Error(
        `content type ${ct.name} (KINDS key "${key}") is owned but has no matching personal/catalog KINDS entry — register it in packages/all-of-oyl/src/collections.ts`,
      )
    }
  }
  grants.sort(
    (a, b) =>
      a.contentType.localeCompare(b.contentType) ||
      a.actions.length - b.actions.length,
  )
  return {
    defaultRole: "authenticated",
    roles: [{ name: "authenticated", grants }],
  }
}

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  const ir = JSON.parse(readFileSync(resolve(pkg, "camis.json"), "utf8")) as Ir
  writeFileSync(
    resolve(pkg, "roles.json"),
    `${JSON.stringify(generateRoles(ir), null, 2)}\n`,
  )
  console.log("✓ roles.json")
}
