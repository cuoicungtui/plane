/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import type { TPageTreeInput } from "../src/page-tree";
import {
  buildPageTree,
  filterPageTree,
  getPageAncestors,
  getPageDescendantIds,
  getOptimisticSortOrder,
  getPageDropPosition,
  getPageTreeRows,
} from "../src/page-tree";

const page = (id: string, parent: string | null = null, sort_order?: number, created_at?: string): TPageTreeInput => ({
  id,
  parent,
  sort_order,
  created_at,
});

// root
// ├── a (1)
// │   ├── a1 (1)
// │   └── a2 (2)
// │       └── a2x (1)
// ├── b (2)
// └── c (3)
const sample = () => [
  page("c", null, 3),
  page("a2x", "a2", 1),
  page("b", null, 2),
  page("a2", "a", 2),
  page("a", null, 1),
  page("a1", "a", 1),
];

describe("buildPageTree", () => {
  it("nests pages and orders siblings by sort_order", () => {
    const tree = buildPageTree(sample());
    expect(tree.rootIds).toEqual(["a", "b", "c"]);
    expect(tree.childrenIds.a).toEqual(["a1", "a2"]);
    expect(tree.childrenIds.a2).toEqual(["a2x"]);
    expect(tree.parentIds.a2x).toBe("a2");
    expect(tree.parentIds.a).toBeNull();
    expect(tree.orphanIds.size).toBe(0);
  });

  it("orders siblings that share a sort_order by created_at, then id", () => {
    const tree = buildPageTree([
      page("z", null, 65535, "2026-01-01T00:00:00Z"),
      page("y", null, 65535, "2026-01-02T00:00:00Z"),
      page("x", null, 65535, "2026-01-02T00:00:00Z"),
    ]);
    expect(tree.rootIds).toEqual(["z", "x", "y"]);
  });

  it("treats a missing sort_order as the API default", () => {
    const tree = buildPageTree([page("late", null, 70000), page("legacy", null, undefined), page("early", null, 100)]);
    expect(tree.rootIds).toEqual(["early", "legacy", "late"]);
  });

  it("puts a page whose parent is not in the list at the root and flags it as an orphan", () => {
    const tree = buildPageTree([page("a"), page("hiddenChild", "hidden-parent", 1), page("child", "hiddenChild", 1)]);
    expect(tree.rootIds).toEqual(["hiddenChild", "a"]);
    expect(tree.orphanIds).toEqual(new Set(["hiddenChild"]));
    expect(tree.childrenIds.hiddenChild).toEqual(["child"]);
    expect(tree.parentIds.hiddenChild).toBeNull();
  });

  it("breaks a parent loop instead of dropping the pages", () => {
    const tree = buildPageTree([page("a", "b", 1), page("b", "a", 2), page("self", "self", 1)]);
    expect(new Set(tree.rootIds)).toEqual(new Set(["a", "self"]));
    expect(tree.childrenIds.a).toEqual(["b"]);
    expect(tree.orphanIds).toEqual(new Set(["a", "self"]));
    expect(getPageDescendantIds(tree, "a")).toEqual(["b"]);
  });

  it("returns an empty tree for no pages", () => {
    const tree = buildPageTree([]);
    expect(tree.rootIds).toEqual([]);
    expect(tree.childrenIds).toEqual({});
  });
});

describe("getPageAncestors", () => {
  it("returns the visible ancestors from the root down", () => {
    const tree = buildPageTree(sample());
    expect(getPageAncestors(tree, "a2x")).toEqual({ ancestorIds: ["a", "a2"], hasHiddenAncestor: false });
    expect(getPageAncestors(tree, "a")).toEqual({ ancestorIds: [], hasHiddenAncestor: false });
  });

  it("flags a hidden ancestor above an orphan and above its children", () => {
    const tree = buildPageTree([page("orphan", "hidden", 1), page("kid", "orphan", 1)]);
    expect(getPageAncestors(tree, "orphan")).toEqual({ ancestorIds: [], hasHiddenAncestor: true });
    expect(getPageAncestors(tree, "kid")).toEqual({ ancestorIds: ["orphan"], hasHiddenAncestor: true });
  });

  it("returns nothing for an unknown page", () => {
    expect(getPageAncestors(buildPageTree(sample()), "nope")).toEqual({ ancestorIds: [], hasHiddenAncestor: false });
  });
});

describe("getPageDescendantIds", () => {
  it("lists descendants in display order", () => {
    const tree = buildPageTree(sample());
    expect(getPageDescendantIds(tree, "a")).toEqual(["a1", "a2", "a2x"]);
    expect(getPageDescendantIds(tree, "b")).toEqual([]);
    expect(getPageDescendantIds(tree, "nope")).toEqual([]);
  });
});

describe("filterPageTree", () => {
  const tree = buildPageTree(sample());

  it("keeps a match deep in the tree together with the path to it", () => {
    const result = filterPageTree(tree, (id) => id === "a2x");
    expect(result.matchIds).toEqual(new Set(["a2x"]));
    expect(result.visibleIds).toEqual(new Set(["a", "a2", "a2x"]));
    expect(result.expandedIds).toEqual(new Set(["a", "a2"]));
  });

  it("does not expand a matching parent, and does not pull in its unmatched children", () => {
    const result = filterPageTree(tree, (id) => id === "a");
    expect(result.visibleIds).toEqual(new Set(["a"]));
    expect(result.expandedIds.size).toBe(0);
  });

  it("merges the paths of several matches", () => {
    const result = filterPageTree(tree, (id) => id === "a1" || id === "c");
    expect(result.visibleIds).toEqual(new Set(["a", "a1", "c"]));
    expect(result.expandedIds).toEqual(new Set(["a"]));
  });

  it("returns nothing when nothing matches", () => {
    const result = filterPageTree(tree, () => false);
    expect(result.visibleIds.size).toBe(0);
  });
});

describe("getPageDropPosition", () => {
  const tree = buildPageTree(sample());

  it("drops after a sibling", () => {
    expect(getPageDropPosition(tree, { dragId: "c", targetId: "a", instruction: "after" })).toEqual({
      parent_id: null,
      prev_sibling_id: "a",
      isNoop: false,
    });
  });

  it("drops before the first sibling as the first child of the group", () => {
    expect(getPageDropPosition(tree, { dragId: "c", targetId: "a", instruction: "before" })).toEqual({
      parent_id: null,
      prev_sibling_id: null,
      isNoop: false,
    });
  });

  it("drops before a middle sibling after the one that precedes it", () => {
    expect(getPageDropPosition(tree, { dragId: "c", targetId: "b", instruction: "before" })).toEqual({
      parent_id: null,
      prev_sibling_id: "a",
      isNoop: false,
    });
  });

  it("makes the page the last child of the target", () => {
    expect(getPageDropPosition(tree, { dragId: "c", targetId: "a", instruction: "child" })).toEqual({
      parent_id: "a",
      prev_sibling_id: "a2",
      isNoop: false,
    });
  });

  it("makes the page the first child of the target", () => {
    expect(getPageDropPosition(tree, { dragId: "c", targetId: "a", instruction: "first-child" })).toEqual({
      parent_id: "a",
      prev_sibling_id: null,
      isNoop: false,
    });
  });

  it("flags first-child on a page that already is the first child, and refuses cycles", () => {
    expect(getPageDropPosition(tree, { dragId: "a1", targetId: "a", instruction: "first-child" })?.isNoop).toBe(true);
    expect(getPageDropPosition(tree, { dragId: "a2", targetId: "a", instruction: "first-child" })?.isNoop).toBe(false);
    expect(getPageDropPosition(tree, { dragId: "a", targetId: "a2", instruction: "first-child" })).toBeNull();
  });

  it("makes the page the only child of a leaf", () => {
    expect(getPageDropPosition(tree, { dragId: "c", targetId: "b", instruction: "child" })).toEqual({
      parent_id: "b",
      prev_sibling_id: null,
      isNoop: false,
    });
  });

  it("moves a nested page to another parent using the target's real parent", () => {
    expect(getPageDropPosition(tree, { dragId: "a1", targetId: "a2x", instruction: "before" })).toEqual({
      parent_id: "a2",
      prev_sibling_id: null,
      isNoop: false,
    });
  });

  it("moves a nested page back to the root", () => {
    expect(getPageDropPosition(tree, { dragId: "a2x", targetId: "c", instruction: "after" })).toEqual({
      parent_id: null,
      prev_sibling_id: "c",
      isNoop: false,
    });
  });

  it("never uses the dragged page as its own previous sibling", () => {
    expect(getPageDropPosition(tree, { dragId: "a1", targetId: "a2", instruction: "after" })).toEqual({
      parent_id: "a",
      prev_sibling_id: "a2",
      isNoop: false,
    });
    expect(getPageDropPosition(tree, { dragId: "b", targetId: "c", instruction: "before" })).toEqual({
      parent_id: null,
      prev_sibling_id: "a",
      isNoop: true,
    });
  });

  it("refuses to drop a page onto itself or into its own subtree", () => {
    expect(getPageDropPosition(tree, { dragId: "a", targetId: "a", instruction: "child" })).toBeNull();
    expect(getPageDropPosition(tree, { dragId: "a", targetId: "a2x", instruction: "child" })).toBeNull();
    expect(getPageDropPosition(tree, { dragId: "a", targetId: "a2", instruction: "after" })).toBeNull();
  });

  it("refuses unknown pages", () => {
    expect(getPageDropPosition(tree, { dragId: "nope", targetId: "a", instruction: "after" })).toBeNull();
    expect(getPageDropPosition(tree, { dragId: "a", targetId: "nope", instruction: "after" })).toBeNull();
  });

  it("flags a drop that leaves the page where it is", () => {
    expect(getPageDropPosition(tree, { dragId: "b", targetId: "a", instruction: "after" })?.isNoop).toBe(true);
    expect(getPageDropPosition(tree, { dragId: "a2", targetId: "a", instruction: "child" })?.isNoop).toBe(true);
    expect(getPageDropPosition(tree, { dragId: "a1", targetId: "a2", instruction: "before" })?.isNoop).toBe(true);
    expect(getPageDropPosition(tree, { dragId: "a", targetId: "b", instruction: "before" })?.isNoop).toBe(true);
  });

  describe("with an orphan (child of a page the user cannot see)", () => {
    // root: [r1, orphan(real parent hidden), r2, r3]; orphan has a child
    const withOrphan = buildPageTree([
      page("r1", null, 1),
      page("orphan", "hidden", 2),
      page("r2", null, 3),
      page("r3", null, 4),
      page("kid", "orphan", 1),
    ]);

    it("cannot be dragged", () => {
      expect(getPageDropPosition(withOrphan, { dragId: "orphan", targetId: "r1", instruction: "after" })).toBeNull();
    });

    it("is never used as the previous sibling", () => {
      expect(getPageDropPosition(withOrphan, { dragId: "r3", targetId: "orphan", instruction: "after" })).toEqual({
        parent_id: null,
        prev_sibling_id: "r1",
        isNoop: false,
      });
    });

    it("can still receive children, and its own child can still be moved out", () => {
      expect(getPageDropPosition(withOrphan, { dragId: "r1", targetId: "orphan", instruction: "child" })).toEqual({
        parent_id: "orphan",
        prev_sibling_id: "kid",
        isNoop: false,
      });
      expect(getPageDropPosition(withOrphan, { dragId: "kid", targetId: "r2", instruction: "after" })).toEqual({
        parent_id: null,
        prev_sibling_id: "r2",
        isNoop: false,
      });
    });

    it("does not count a drop next to an orphan as a no-op when the real parent would change", () => {
      expect(getPageDropPosition(withOrphan, { dragId: "kid", targetId: "orphan", instruction: "after" })).toEqual({
        parent_id: null,
        prev_sibling_id: "r1",
        isNoop: false,
      });
    });
  });
});

describe("getPageTreeRows", () => {
  const tree = buildPageTree(sample());

  it("lists only the roots when nothing is expanded", () => {
    expect(getPageTreeRows(tree, { expandedIds: new Set() })).toEqual([
      { id: "a", depth: 0, hasChildren: true, isExpanded: false },
      { id: "b", depth: 0, hasChildren: false, isExpanded: false },
      { id: "c", depth: 0, hasChildren: false, isExpanded: false },
    ]);
  });

  it("lists the children of expanded pages right below them, with their depth", () => {
    const rows = getPageTreeRows(tree, { expandedIds: new Set(["a", "a2"]) });
    expect(rows.map((row) => [row.id, row.depth])).toEqual([
      ["a", 0],
      ["a1", 1],
      ["a2", 1],
      ["a2x", 2],
      ["b", 0],
      ["c", 0],
    ]);
    expect(rows.find((row) => row.id === "a2")).toEqual({ id: "a2", depth: 1, hasChildren: true, isExpanded: true });
  });

  it("does not list the children of a collapsed page even when a deeper page is expanded", () => {
    expect(getPageTreeRows(tree, { expandedIds: new Set(["a2"]) }).map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("only lists visible pages and counts only visible children", () => {
    const visibleIds = new Set(["a", "a2", "a2x"]);
    const rows = getPageTreeRows(tree, { expandedIds: new Set(["a", "a2"]), visibleIds });
    expect(rows.map((row) => row.id)).toEqual(["a", "a2", "a2x"]);
    const onlyA = getPageTreeRows(tree, { expandedIds: new Set(["a"]), visibleIds: new Set(["a"]) });
    expect(onlyA).toEqual([{ id: "a", depth: 0, hasChildren: false, isExpanded: false }]);
  });

  it("lists orphans at the root together with their own children", () => {
    const withOrphan = buildPageTree([page("r", null, 1), page("orphan", "hidden", 2), page("kid", "orphan", 1)]);
    expect(getPageTreeRows(withOrphan, { expandedIds: new Set(["orphan"]) }).map((row) => [row.id, row.depth])).toEqual(
      [
        ["r", 0],
        ["orphan", 0],
        ["kid", 1],
      ]
    );
  });
});

describe("getOptimisticSortOrder", () => {
  const tree = buildPageTree(sample());
  const orders = { a: 100, b: 200, c: 300, a1: 10, a2: 20, a2x: 5 };

  it("puts the page halfway between the previous sibling and the one after it", () => {
    expect(getOptimisticSortOrder(tree, orders, { dragId: "c", parent_id: null, prev_sibling_id: "a" })).toBe(150);
    expect(getOptimisticSortOrder(tree, orders, { dragId: "a2x", parent_id: "a", prev_sibling_id: "a1" })).toBe(15);
  });

  it("puts the page one step after the last sibling", () => {
    expect(getOptimisticSortOrder(tree, orders, { dragId: "a", parent_id: null, prev_sibling_id: "c" })).toBe(
      300 + 65535
    );
  });

  it("puts the page one step before the first sibling", () => {
    expect(getOptimisticSortOrder(tree, orders, { dragId: "c", parent_id: null, prev_sibling_id: null })).toBe(
      100 - 65535
    );
  });

  it("uses the default for the first child of a page without children", () => {
    expect(getOptimisticSortOrder(tree, orders, { dragId: "c", parent_id: "b", prev_sibling_id: null })).toBe(65535);
  });

  it("ignores the dragged page when it is one of the neighbours", () => {
    expect(getOptimisticSortOrder(tree, orders, { dragId: "b", parent_id: null, prev_sibling_id: "a" })).toBe(200);
    expect(getOptimisticSortOrder(tree, orders, { dragId: "a2", parent_id: "a", prev_sibling_id: "a1" })).toBe(
      10 + 65535
    );
  });

  it("treats a missing sort_order as the API default", () => {
    expect(getOptimisticSortOrder(tree, {}, { dragId: "c", parent_id: null, prev_sibling_id: "a" })).toBe(65535);
  });
});
