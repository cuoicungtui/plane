import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The board (Plait, Slate, rough.js) is ~550 KB and must load only when a page actually holds a
// whiteboard. A single value import of the package root from code that ships in the page's main
// bundle defeats that: the bundler folds the whole board into the route (this happened once, through a
// one-line helper). Type checks, lint and unit tests cannot see it, only a production build can, so
// these tests pin the two source-level rules that keep it from coming back.

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = resolve(packageRoot, "../../apps/web");

/**
 * Specifiers of the static imports and re-exports in `source` that carry a value. `import type` and
 * `export type` are erased by the compiler and cost nothing at run time, so they are not listed.
 * Dynamic `import()` is not listed either: that is how the board is meant to be loaded.
 */
const valueImportsOf = (source: string): string[] => {
  const pattern = /^[ \t]*(?:import|export)\s+(?!type\b)(?:[^;'"]*?\bfrom\s+)?["']([^"']+)["']/gm;
  return [...source.matchAll(pattern)].map((match) => match[1]);
};

describe("valueImportsOf (the checker the rules below rely on)", () => {
  it.each([
    ['import { a } from "x";', ["x"]],
    ['import a, { b } from "x";', ["x"]],
    ['import * as a from "x";', ["x"]],
    ['import "x";', ["x"]],
    ['export { a } from "x";', ["x"]],
    ['export * from "x";', ["x"]],
    ["import {\n  a,\n  b,\n} from 'x';", ["x"]],
    ['  import { a } from "x";', ["x"]],
    ['import { type A, b } from "x";', ["x"]],
    ['import { a } from "x";\nimport { b } from "y";', ["x", "y"]],
  ])("finds %j", (source, expected) => {
    expect(valueImportsOf(source)).toEqual(expected);
  });

  it.each([
    ['import type { A } from "x";'],
    ["import type {\n  A,\n  B,\n} from 'x';"],
    ['export type { A } from "x";'],
    ['const lazy = () => import("x");'],
    ['const a = "import { b } from x";'],
    ['// import { a } from "x";'],
  ])("ignores %j", (source) => {
    expect(valueImportsOf(source)).toEqual([]);
  });
});

describe("the app-facing helper module", () => {
  it("asset-ids.ts imports nothing that runs (types only), so it can be loaded without the board", () => {
    const source = readFileSync(join(packageRoot, "src/asset-ids.ts"), "utf8");
    expect(valueImportsOf(source)).toEqual([]);
  });

  it("is exposed as a package subpath, which is how the app reaches it without the package root", () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
      exports: Record<string, string>;
    };
    expect(manifest.exports["./asset-ids"]).toBe("./src/asset-ids.ts");
  });
});

const SKIPPED_DIRS = new Set(["node_modules", "build", "dist"]);

/** Every .ts/.tsx source of the app; tooling folders (`.react-router`, `.turbo`, …) and build output are left out. */
const sourcesOf = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name.startsWith(".") || SKIPPED_DIRS.has(entry.name) ? [] : sourcesOf(path);
    return /\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [path] : [];
  });

/** Files of the app that satisfy `hasImport`, relative to apps/web and with forward slashes. */
const filesImporting = (hasImport: (specifier: string) => boolean): string[] =>
  sourcesOf(webRoot)
    .filter((file) => {
      const source = readFileSync(file, "utf8");
      // Cheap pre-filter: reading every file through the regex is wasted work.
      return source.includes("whiteboard") && valueImportsOf(source).some(hasImport);
    })
    .map((file) => relative(webRoot, file).split(sep).join("/"))
    .toSorted();

describe.skipIf(!existsSync(join(webRoot, "package.json")))("apps/web keeps the board out of its main bundle", () => {
  it("only the export route and the lazy board component import the package root as a value", () => {
    expect(filesImporting((specifier) => specifier === "@plane/whiteboard")).toEqual([
      // A route of its own: it exists to draw one board for the PDF export, so it needs the board.
      "app/(all)/whiteboard-export/page.tsx",
      // The lazy chunk. Its only importer must be the `lazy(() => import(...))` in the embed (next test).
      "core/components/pages/editor/embeds/page-whiteboard-board.tsx",
      // The board's own toolbar and property bar: imported only by the lazy board above, so they ride in its chunk.
      "core/components/pages/editor/embeds/whiteboard-property-bar.tsx",
      "core/components/pages/editor/embeds/whiteboard-toolbar.tsx",
    ]);
  });

  it("nothing imports the lazy board component statically", () => {
    expect(filesImporting((specifier) => /(?:^|\/)page-whiteboard-board$/.test(specifier))).toEqual([]);
  });
});
