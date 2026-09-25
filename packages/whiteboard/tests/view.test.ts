import type { PlaitBoard } from "@plait/core";
import { BoardTransforms, setupTestingBoard, withHistory, withOptions } from "@plait/core";
import { withDraw } from "@plait/draw";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WHITEBOARD_ZOOM_LEVELS,
  canRedoWhiteboard,
  canUndoWhiteboard,
  fitWhiteboard,
  getWhiteboardZoom,
  setWhiteboardZoom,
  stepWhiteboardZoom,
  whiteboardZoomPercent,
  zoomWhiteboard,
} from "../src/view";

const emptyBoard = (): PlaitBoard => setupTestingBoard([withOptions, withHistory, withDraw], []).board;

describe("stepWhiteboardZoom", () => {
  it("walks the ladder one step at a time", () => {
    expect(stepWhiteboardZoom(1, "in")).toBe(1.25);
    expect(stepWhiteboardZoom(1, "out")).toBe(0.75);
    expect(stepWhiteboardZoom(0.1, "in")).toBe(0.25);
  });

  it("snaps a between-step zoom (e.g. after a pinch) to the next step in that direction", () => {
    expect(stepWhiteboardZoom(0.83, "in")).toBe(1);
    expect(stepWhiteboardZoom(0.83, "out")).toBe(0.75);
  });

  it("stops at both ends of the ladder", () => {
    expect(stepWhiteboardZoom(4, "in")).toBe(4);
    expect(stepWhiteboardZoom(0.1, "out")).toBe(0.1);
  });

  it("uses the same range Plait clamps to", () => {
    expect(WHITEBOARD_ZOOM_LEVELS[0]).toBe(0.1);
    expect(WHITEBOARD_ZOOM_LEVELS[WHITEBOARD_ZOOM_LEVELS.length - 1]).toBe(4);
  });
});

describe("whiteboardZoomPercent", () => {
  it("rounds to a whole percent", () => {
    expect(whiteboardZoomPercent(1)).toBe(100);
    expect(whiteboardZoomPercent(0.756)).toBe(76);
  });
});

describe("board zoom", () => {
  afterEach(() => vi.restoreAllMocks());

  // Plait's own zoom needs a laid-out DOM container; that path is checked in the browser.
  const spyOnZoom = () => vi.spyOn(BoardTransforms, "updateZoom").mockImplementation(() => undefined);

  it("starts at 100 %", () => {
    expect(getWhiteboardZoom(emptyBoard())).toBe(1);
  });

  it("zooms to the next ladder step", () => {
    const updateZoom = spyOnZoom();
    const board = emptyBoard();
    zoomWhiteboard(board, "in");
    expect(updateZoom).toHaveBeenLastCalledWith(board, 1.25);
    zoomWhiteboard(board, "out");
    expect(updateZoom).toHaveBeenLastCalledWith(board, 0.75);
  });

  it("clamps a requested zoom to the allowed range", () => {
    const updateZoom = spyOnZoom();
    const board = emptyBoard();
    setWhiteboardZoom(board, 50);
    expect(updateZoom).toHaveBeenLastCalledWith(board, 4);
    setWhiteboardZoom(board, 0.001);
    expect(updateZoom).toHaveBeenLastCalledWith(board, 0.1);
  });

  it("fit on an empty board returns to 100 % instead of asking Plait to fit nothing", () => {
    const updateZoom = spyOnZoom();
    const fitViewport = vi.spyOn(BoardTransforms, "fitViewport").mockImplementation(() => undefined);
    const board = emptyBoard();
    fitWhiteboard(board);
    expect(updateZoom).toHaveBeenLastCalledWith(board, 1);
    expect(fitViewport).not.toHaveBeenCalled();
  });
});

describe("undo and redo availability", () => {
  it("is false on a fresh board", () => {
    const board = emptyBoard();
    expect(canUndoWhiteboard(board)).toBe(false);
    expect(canRedoWhiteboard(board)).toBe(false);
  });
});
