import type { PlaitBoard } from "@plait/core";
import { describe, expect, it } from "vitest";
import {
  WHITEBOARD_ENGINE,
  WHITEBOARD_SCHEMA_VERSION,
  createEmptyScene,
  isWhiteboardScene,
  sceneFromBoard,
} from "../src/scene";

describe("scene constants", () => {
  it("match what the API stores for a Plait board", () => {
    // apps/api serializers/whiteboard.py accepts and defaults to exactly these two values.
    expect(WHITEBOARD_ENGINE).toBe("plait");
    expect(WHITEBOARD_SCHEMA_VERSION).toBe(2);
  });
});

describe("createEmptyScene", () => {
  it("has no elements", () => {
    expect(createEmptyScene()).toEqual({ children: [] });
  });

  it("returns a new scene each time, so one board's edits never leak into another", () => {
    const first = createEmptyScene();
    first.children.push({ id: "a" });
    expect(createEmptyScene().children).toEqual([]);
  });
});

describe("isWhiteboardScene", () => {
  it("accepts an empty scene", () => {
    expect(isWhiteboardScene({ children: [] })).toBe(true);
  });

  it("accepts a scene with elements, a viewport and a theme", () => {
    const scene = {
      children: [
        { id: "shape-1", type: "geometry" },
        { id: "mind-1", type: "mindmap", children: [{ id: "node-1" }] },
      ],
      viewport: { zoom: 1.5 },
      theme: { themeColorMode: "default" },
    };
    expect(isWhiteboardScene(scene)).toBe(true);
  });

  it("rejects a legacy Excalidraw scene, which is what triggers the 'no longer supported' frame", () => {
    expect(isWhiteboardScene({ type: "excalidraw", version: 2, elements: [], appState: {}, files: {} })).toBe(false);
    expect(isWhiteboardScene({ elements: [{ id: "x" }], files: {} })).toBe(false);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "children"],
    ["a number", 1],
    ["an array", []],
    ["an array of elements", [{ id: "a" }]],
    ["an object without children", {}],
    ["children that is not an array", { children: { id: "a" } }],
  ])("rejects %s", (_label, value) => {
    expect(isWhiteboardScene(value)).toBe(false);
  });

  it.each([
    ["a missing id", { type: "geometry" }],
    ["an empty id", { id: "" }],
    ["a numeric id", { id: 7 }],
    ["a null element", null],
    ["a string element", "shape"],
    ["an array element", [{ id: "a" }]],
  ])("rejects a scene with an element that has %s", (_label, element) => {
    expect(isWhiteboardScene({ children: [{ id: "ok" }, element] })).toBe(false);
  });
});

describe("sceneFromBoard", () => {
  it("snapshots the element tree, zoom and colour mode", () => {
    const children = [{ id: "a" }, { id: "b" }];
    const board = { children, viewport: { zoom: 2 }, theme: { themeColorMode: "dark" } } as unknown as PlaitBoard;
    expect(sceneFromBoard(board)).toEqual({
      children,
      viewport: { zoom: 2 },
      theme: { themeColorMode: "dark" },
    });
  });

  it("falls back to zoom 1 and the default colour mode when the board has neither yet", () => {
    const board = { children: [] } as unknown as PlaitBoard;
    expect(sceneFromBoard(board)).toEqual({
      children: [],
      viewport: { zoom: 1 },
      theme: { themeColorMode: "default" },
    });
  });

  it("produces something the loader accepts back", () => {
    const board = { children: [{ id: "a" }] } as unknown as PlaitBoard;
    expect(isWhiteboardScene(sceneFromBoard(board))).toBe(true);
  });
});
