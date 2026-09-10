import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const PKG = resolve(__dirname, "..")

describe("camis link", () => {
  it("resolves the camis CLI from the sibling checkout", () => {
    const out = execFileSync("pnpm", ["exec", "camis", "--help"], {
      cwd: PKG,
      encoding: "utf8",
    })
    expect(out).toContain("camis import")
  })
  it("camis.config.json targets filament with the strapi api style and the overlay", () => {
    const cfg = JSON.parse(
      readFileSync(resolve(PKG, "camis.config.json"), "utf8"),
    ) as {
      ir: string
      roles: string
      protected: string
      targets: {
        target: string
        out: string
        apiStyle?: string
        storageLayout?: string
        projectName?: string
      }[]
    }
    expect(cfg).toMatchObject({
      ir: "./camis.json",
      roles: "./roles.json",
      protected: "./overlay",
    })
    expect(cfg.targets).toEqual([
      {
        target: "filament",
        out: "./laravel",
        apiStyle: "strapi",
        storageLayout: "strapi",
        projectName: "oyl",
      },
    ])
  })
})
