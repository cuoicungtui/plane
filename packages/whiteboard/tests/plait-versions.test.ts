// @vitest-environment node
// Reads files from disk; under happy-dom `import.meta.url` is not a file URL.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * R02: two copies of `@plait/core` in the bundle break every plugin, because Plait keeps its board
 * state in module-level WeakMaps and checks types with `instanceof`-style helpers. These tests read
 * the workspace files directly so a stray `^` or a dependency that drags in a second copy fails CI
 * instead of showing up as a board that will not draw.
 */

const rootFile = (name: string): string[] =>
  readFileSync(fileURLToPath(new URL(`../../../${name}`, import.meta.url)), "utf8").split(/\r?\n/);

const PLAIT_PACKAGES = ["common", "core", "draw", "layouts", "mind", "text-plugins"].map((name) => `@plait/${name}`);

/** Lines that belong to the top-level `section:` of pnpm-lock.yaml. */
const lockSection = (lines: string[], section: string): string[] => {
  const start = lines.indexOf(`${section}:`);
  if (start === -1) throw new Error(`pnpm-lock.yaml has no "${section}:" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^\S/.test(line));
  return end === -1 ? rest : rest.slice(0, end);
};

/** `@plait/core@0.94.1(immer@10.2.0)` style keys, as `[name, version, key]`. */
const plaitKeys = (lines: string[]): Array<[string, string, string]> =>
  lines.flatMap((line) => {
    const match = /^ {2}'?(@plait\/[a-z-]+)@(\d[^(':]*)/.exec(line);
    return match
      ? [[match[1]!, match[2]!, line.trim().replace(/:$/, "").replace(/^'|'$/g, "")] as [string, string, string]]
      : [];
  });

describe("Plait versions", () => {
  const lock = rootFile("pnpm-lock.yaml");

  it.each(["packages", "snapshots"])("pnpm-lock.yaml %s: each @plait package appears exactly once", (section) => {
    const keys = plaitKeys(lockSection(lock, section));
    for (const name of PLAIT_PACKAGES) {
      expect(
        keys.filter(([keyName]) => keyName === name).map(([, , key]) => key),
        `${name} in ${section}`
      ).toHaveLength(1);
    }
  });

  it("pnpm-lock.yaml: no @plait package outside the six the whiteboard uses", () => {
    const names = new Set(plaitKeys(lockSection(lock, "packages")).map(([name]) => name));
    expect([...names].toSorted()).toEqual(PLAIT_PACKAGES.toSorted());
  });

  it("pnpm-lock.yaml: every @plait package is on the same version as @plait/core", () => {
    const keys = plaitKeys(lockSection(lock, "packages"));
    const versions = new Set(keys.map(([, version]) => version));
    expect([...versions]).toHaveLength(1);
  });

  it("pnpm-workspace.yaml: every @plait package in the catalog is pinned to that one exact version", () => {
    const entries = rootFile("pnpm-workspace.yaml").flatMap((line) => {
      const match = /^\s+"(@plait\/[a-z-]+)":\s+"([^"]+)"\s*$/.exec(line);
      return match ? [[match[1]!, match[2]!] as [string, string]] : [];
    });
    expect(entries.map(([name]) => name).toSorted()).toEqual(PLAIT_PACKAGES.toSorted());
    for (const [name, version] of entries) {
      expect(version, `${name} must be an exact version, not a range`).toMatch(/^\d+\.\d+\.\d+$/);
    }
    expect(new Set(entries.map(([, version]) => version)).size).toBe(1);

    const locked = plaitKeys(lockSection(lock, "packages"))[0]?.[1];
    expect(entries[0]?.[1]).toBe(locked);
  });
});
