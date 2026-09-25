import type { PlaitBoard, PlaitElement } from "@plait/core";
import { addSelectedElement, clearSelectedElement, setupTestingBoard, withHistory, withOptions } from "@plait/core";
import { withDraw } from "@plait/draw";
import { withMind } from "@plait/mind";
import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_WHITEBOARD_SELECTION,
  alignWhiteboardSelection,
  deleteWhiteboardSelection,
  distributeWhiteboardSelection,
  moveWhiteboardSelectionLayer,
  readWhiteboardSelection,
  setWhiteboardArrowMarker,
  setWhiteboardArrowShape,
  setWhiteboardBranchShape,
  setWhiteboardBranchWidth,
  setWhiteboardFill,
  setWhiteboardMindLayout,
  setWhiteboardMindShape,
  setWhiteboardShape,
  setWhiteboardStrokeColor,
  setWhiteboardStrokeStyle,
  setWhiteboardStrokeWidth,
  whiteboardSelectionEquals,
} from "../src/properties";

const text = (value: string) => ({ children: [{ text: value }] });

const shape = (id: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
  ({
    id,
    type: "geometry",
    shape: "rectangle",
    angle: 0,
    points: [
      [x, y],
      [x + 100, y + 60],
    ],
    text: text(id),
    ...extra,
  }) as unknown as PlaitElement;

const arrow = (id: string) =>
  ({
    id,
    type: "arrow-line",
    shape: "straight",
    source: { marker: "none" },
    target: { marker: "arrow" },
    texts: [],
    points: [
      [0, 200],
      [200, 200],
    ],
    strokeWidth: 2,
  }) as unknown as PlaitElement;

const mindRoot = (id: string) =>
  ({
    id,
    type: "mindmap",
    points: [[0, 400]],
    rightNodeCount: 1,
    width: 100,
    height: 40,
    isRoot: true,
    layout: "right",
    data: { topic: text("Root") },
    children: [{ id: `${id}-child`, data: { topic: text("Child") }, children: [], width: 80, height: 30 }],
  }) as unknown as PlaitElement;

const setup = (children: PlaitElement[]): PlaitBoard =>
  setupTestingBoard([withOptions, withHistory, withDraw, withMind], children, { withRoughSVG: true }).board;

const select = (board: PlaitBoard, ...ids: string[]) => {
  clearSelectedElement(board);
  for (const id of ids) {
    const element = board.children.find((child) => child.id === id);
    if (element) addSelectedElement(board, element);
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const get = (board: PlaitBoard, id: string) => board.children.find((child) => child.id === id) as any;

describe("readWhiteboardSelection", () => {
  it("is empty when nothing is selected", () => {
    const board = setup([shape("a", 0, 0)]);
    expect(readWhiteboardSelection(board)).toBe(EMPTY_WHITEBOARD_SELECTION);
  });

  it("describes a selected shape", () => {
    const board = setup([shape("a", 0, 0, { fill: "#ff0000", strokeWidth: 4 })]);
    select(board, "a");
    expect(readWhiteboardSelection(board)).toMatchObject({
      count: 1,
      hasGeometry: true,
      hasArrow: false,
      canFill: true,
      canStroke: true,
      canStyleText: true,
      shape: "rectangle",
      fill: "#ff0000",
      strokeWidth: 4,
      canAlign: false,
    });
  });

  it("describes an arrow as unfillable and without text styling", () => {
    const board = setup([arrow("l")]);
    select(board, "l");
    expect(readWhiteboardSelection(board)).toMatchObject({
      hasArrow: true,
      canFill: false,
      canStroke: true,
      canStyleText: false,
      arrowShape: "straight",
      arrowSource: "none",
      arrowTarget: "arrow",
    });
  });

  it("describes a mind node with its layout", () => {
    const board = setup([mindRoot("m")]);
    select(board, "m");
    expect(readWhiteboardSelection(board)).toMatchObject({
      hasMind: true,
      canFill: true,
      canStyleText: true,
      mindLayout: "right",
    });
  });

  it("enables align for two elements and distribute for three", () => {
    const board = setup([shape("a", 0, 0), shape("b", 200, 0), shape("c", 400, 0)]);
    select(board, "a", "b");
    expect(readWhiteboardSelection(board)).toMatchObject({ canAlign: true, canDistribute: false });
    select(board, "a", "b", "c");
    expect(readWhiteboardSelection(board)).toMatchObject({ canAlign: true, canDistribute: true });
  });

  it("gives equal snapshots for an unchanged selection", () => {
    const board = setup([shape("a", 0, 0)]);
    select(board, "a");
    expect(whiteboardSelectionEquals(readWhiteboardSelection(board), readWhiteboardSelection(board))).toBe(true);
    expect(whiteboardSelectionEquals(readWhiteboardSelection(board), EMPTY_WHITEBOARD_SELECTION)).toBe(false);
  });
});

describe("appearance setters", () => {
  let board: PlaitBoard;
  beforeEach(() => {
    board = setup([shape("a", 0, 0), arrow("l"), mindRoot("m")]);
  });

  it("fill only reaches shapes and mind nodes, never a line", () => {
    select(board, "a", "l", "m");
    setWhiteboardFill(board, "#00ff00");
    expect(get(board, "a").fill).toBe("#00ff00");
    expect(get(board, "m").fill).toBe("#00ff00");
    expect(get(board, "l").fill).toBeUndefined();
  });

  it("stroke colour, width and style reach shapes and arrows", () => {
    select(board, "a", "l");
    setWhiteboardStrokeColor(board, "#123456");
    setWhiteboardStrokeWidth(board, 6);
    setWhiteboardStrokeStyle(board, "dashed");
    for (const id of ["a", "l"]) {
      expect(get(board, id)).toMatchObject({ strokeColor: "#123456", strokeWidth: 6, strokeStyle: "dashed" });
    }
  });

  it("changes nothing when nothing is selected", () => {
    select(board);
    setWhiteboardFill(board, "#00ff00");
    expect(get(board, "a").fill).toBeUndefined();
  });

  it("switches the shape of a selected geometry", () => {
    select(board, "a");
    setWhiteboardShape(board, "ellipse");
    expect(get(board, "a").shape).toBe("ellipse");
    expect(readWhiteboardSelection(board).shape).toBe("ellipse");
  });
});

describe("arrow setters", () => {
  it("changes the route and both end markers", () => {
    const board = setup([arrow("l")]);
    select(board, "l");
    setWhiteboardArrowShape(board, "elbow");
    setWhiteboardArrowMarker(board, "source", "solid-triangle");
    setWhiteboardArrowMarker(board, "target", "none");
    expect(get(board, "l").shape).toBe("elbow");
    expect(get(board, "l").source.marker).toBe("solid-triangle");
    expect(get(board, "l").target.marker).toBe("none");
  });
});

describe("mind setters", () => {
  it("changes layout, node shape and branch style", () => {
    const board = setup([mindRoot("m")]);
    select(board, "m");
    setWhiteboardMindLayout(board, "standard");
    setWhiteboardMindShape(board, "underline");
    setWhiteboardBranchShape(board, "polyline");
    setWhiteboardBranchWidth(board, 4);
    expect(get(board, "m")).toMatchObject({
      layout: "standard",
      shape: "underline",
      branchShape: "polyline",
      branchWidth: 4,
    });
  });
});

describe("arrangement", () => {
  it("aligns the left edges of the selected shapes", () => {
    const board = setup([shape("a", 10, 0), shape("b", 200, 100)]);
    select(board, "a", "b");
    alignWhiteboardSelection(board, "left");
    expect(get(board, "a").points[0][0]).toBe(get(board, "b").points[0][0]);
  });

  it("ignores align for a single element", () => {
    const board = setup([shape("a", 10, 0)]);
    select(board, "a");
    alignWhiteboardSelection(board, "left");
    expect(get(board, "a").points[0]).toEqual([10, 0]);
  });

  it("spreads three shapes evenly", () => {
    const board = setup([shape("a", 0, 0), shape("b", 120, 0), shape("c", 600, 0)]);
    select(board, "a", "b", "c");
    distributeWhiteboardSelection(board, "horizontal");
    const lefts = ["a", "b", "c"].map((id) => get(board, id).points[0][0]);
    expect(lefts[1] - (lefts[0] + 100)).toBeCloseTo(lefts[2] - (lefts[1] + 100));
  });

  it("brings an element to the front and sends it to the back", () => {
    const board = setup([shape("a", 0, 0), shape("b", 50, 0), shape("c", 100, 0)]);
    select(board, "a");
    moveWhiteboardSelectionLayer(board, "front");
    expect(board.children.map((child) => child.id)).toEqual(["b", "c", "a"]);
    moveWhiteboardSelectionLayer(board, "back");
    expect(board.children.map((child) => child.id)).toEqual(["a", "b", "c"]);
  });

  it("deletes only the selected elements", () => {
    const board = setup([shape("a", 0, 0), shape("b", 200, 0)]);
    select(board, "a");
    deleteWhiteboardSelection(board);
    expect(board.children.map((child) => child.id)).toEqual(["b"]);
  });
});
