// @ts-nocheck
import { describe, expect, it } from "vitest";
import { getGanttDependencyRoutes } from "./dependency-routing";

const dependency = (blockerId, blockedId) => ({ blockerId, blockedId });
const rect = (left, width, centerY) => ({ left, width, centerY });

describe("getGanttDependencyRoutes", () => {
  it("uses an orthogonal route through the free gap for a forward dependency", () => {
    const [route] = getGanttDependencyRoutes(
      [dependency("api", "frontend")],
      { api: rect(10, 40, 22), frontend: rect(120, 50, 66) },
    );

    expect(route.path).toBe("M 50 22 H 85 V 66 H 120");
  });

  it("routes a backwards dependency outside both task bars", () => {
    const [route] = getGanttDependencyRoutes(
      [dependency("later", "earlier")],
      { later: rect(120, 40, 22), earlier: rect(20, 40, 66) },
    );

    expect(route.path).toBe("M 120 22 H 0 V 66 H 60");
  });

  it("assigns separate outside lanes to overlapping dependencies", () => {
    const routes = getGanttDependencyRoutes(
      [dependency("a", "b"), dependency("c", "d")],
      {
        a: rect(20, 80, 22),
        b: rect(60, 60, 66),
        c: rect(30, 90, 110),
        d: rect(70, 50, 154),
      },
    );

    expect(routes[0].path).toContain("H 140");
    expect(routes[1].path).toContain("H 152");
  });
});
