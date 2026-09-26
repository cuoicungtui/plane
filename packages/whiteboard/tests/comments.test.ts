import type { PlaitBoard } from "@plait/core";
import { addSelectedElement, clearSelectedElement, setupTestingBoard, withHistory, withOptions } from "@plait/core";
import { withDraw } from "@plait/draw";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getSingleSelectedWhiteboardElementId,
  getWhiteboardElementIdAtClientPoint,
  hasWhiteboardElement,
  selectWhiteboardElement,
} from "../src/comments";

const rectangle = (id: string, x: number, y: number) => ({
  id,
  type: "geometry",
  shape: "rectangle",
  angle: 0,
  points: [
    [x, y],
    [x + 100, y + 60],
  ],
  text: { children: [{ text: id }] },
});

describe("whiteboard comment helpers", () => {
  let board: PlaitBoard;
  beforeEach(() => {
    board = setupTestingBoard(
      [withOptions, withHistory, withDraw],
      [rectangle("a", 0, 0), rectangle("b", 300, 300)] as never,
      {
        withRoughSVG: true,
      }
    ).board;
  });

  it("finds elements by ID and selects exactly one", () => {
    expect(hasWhiteboardElement(board, "a")).toBe(true);
    expect(hasWhiteboardElement(board, "missing")).toBe(false);
    expect(selectWhiteboardElement(board, "a")).toBe(true);
    expect(getSingleSelectedWhiteboardElementId(board)).toBe("a");
    expect(selectWhiteboardElement(board, "missing")).toBe(false);
  });

  it("reports no single element when two are selected", () => {
    clearSelectedElement(board);
    addSelectedElement(board, board.children[0]);
    addSelectedElement(board, board.children[1]);
    expect(getSingleSelectedWhiteboardElementId(board)).toBeNull();
  });

  it("finds nothing under a point that hits no element or an unmounted board", () => {
    expect(getWhiteboardElementIdAtClientPoint(board, -5000, -5000)).toBeNull();
  });
});
