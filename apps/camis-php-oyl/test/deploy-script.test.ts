import { execFileSync, spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const SCRIPT = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "scripts",
  "deploy-dreamhost.sh",
)

describe("deploy-dreamhost.sh", () => {
  it("parses", () => {
    expect(() => execFileSync("bash", ["-n", SCRIPT])).not.toThrow()
  })
  it("refuses to run without OYL_DH_SSH and says which keys to set", () => {
    const res = spawnSync("bash", [SCRIPT, "--dry-run"], {
      env: {
        PATH: process.env.PATH ?? "",
        HOME: "/nonexistent",
        OYL_DH_SSH: "",
      },
      encoding: "utf8",
    })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("OYL_DH_SSH")
    expect(res.stderr).toContain("OYL_DH_APP_ROOT")
  })
  it("rejects unknown arguments", () => {
    const res = spawnSync("bash", [SCRIPT, "--yolo"], {
      env: { PATH: process.env.PATH ?? "", OYL_DH_SSH: "x@y" },
      encoding: "utf8",
    })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("unknown argument")
  })
})
