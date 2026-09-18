// @ts-nocheck
import { describe, expect, it } from "vitest";
import { getGanttHierarchyRows } from "./hierarchy";

const issue = (id, parent_id = null) => ({ id, parent_id });

describe("getGanttHierarchyRows", () => {
  it("keeps parents with their descendants and supports collapsing a branch", () => {
    const issues = {
      parent: issue("parent"),
      child: issue("child", "parent"),
      grandchild: issue("grandchild", "child"),
      sibling: issue("sibling", "parent"),
    };

    expect(getGanttHierarchyRows(["sibling", "parent", "grandchild", "child"], issues)).toEqual([
      { id: "parent", depth: 0, hasChildren: true },
      { id: "sibling", depth: 1, hasChildren: false },
      { id: "child", depth: 1, hasChildren: true },
      { id: "grandchild", depth: 2, hasChildren: false },
    ]);
    expect(getGanttHierarchyRows(["sibling", "parent", "grandchild", "child"], issues, new Set(["parent"]))).toEqual([
      { id: "parent", depth: 0, hasChildren: true },
    ]);
  });

  it("keeps an item visible at the root when its parent is filtered out", () => {
    expect(getGanttHierarchyRows(["child"], { child: issue("child", "missing-parent") })).toEqual([
      { id: "child", depth: 0, hasChildren: false },
    ]);
  });

  it("renders circular data safely without duplicating issues", () => {
    const rows = getGanttHierarchyRows(["a", "b"], {
      a: issue("a", "b"),
      b: issue("b", "a"),
    });

    expect(rows.map((row) => row.id).sort()).toEqual(["a", "b"]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(2);
  });
});
