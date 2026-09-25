import { BoardTransforms, MAX_ZOOM, MIN_ZOOM } from "@plait/core";
import type { PlaitBoard } from "@plait/core";

/** Zoom steps used by the zoom in/out buttons; every value lies inside Plait's own 0.1 to 4 limits. */
export const WHITEBOARD_ZOOM_LEVELS: readonly number[] = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

const EPSILON = 0.001;

export const getWhiteboardZoom = (board: PlaitBoard): number => board.viewport?.zoom ?? 1;

/** Zoom as the whole percent shown on screen (1 becomes 100). */
export const whiteboardZoomPercent = (zoom: number): number => Math.round(zoom * 100);

/**
 * The step after (`in`) or before (`out`) the given zoom. A zoom between two steps, such as the one
 * "fit to view" leaves behind, moves to the nearest step in that direction instead of skipping one.
 */
export const stepWhiteboardZoom = (zoom: number, direction: "in" | "out"): number => {
  const levels = WHITEBOARD_ZOOM_LEVELS;
  const first = levels[0] ?? MIN_ZOOM;
  const last = levels[levels.length - 1] ?? MAX_ZOOM;
  if (direction === "in") return levels.find((level) => level > zoom + EPSILON) ?? last;
  let previous = first;
  for (const level of levels) {
    if (level >= zoom - EPSILON) break;
    previous = level;
  }
  return previous;
};

/** Zooms around the centre of the visible area. Values outside Plait's limits are clamped. */
export const setWhiteboardZoom = (board: PlaitBoard, zoom: number): void => {
  BoardTransforms.updateZoom(board, Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)));
};

export const zoomWhiteboard = (board: PlaitBoard, direction: "in" | "out"): void => {
  setWhiteboardZoom(board, stepWhiteboardZoom(getWhiteboardZoom(board), direction));
};

export const resetWhiteboardZoom = (board: PlaitBoard): void => setWhiteboardZoom(board, 1);

/**
 * Zooms and scrolls so that all content is visible (never above 100 %). An empty board has nothing to
 * fit, and Plait would compute a viewport from infinite bounds, so it only returns to 100 %.
 */
export const fitWhiteboard = (board: PlaitBoard): void => {
  if (board.children.length === 0) {
    resetWhiteboardZoom(board);
    return;
  }
  BoardTransforms.fitViewport(board);
};

export const undoWhiteboard = (board: PlaitBoard): void => board.undo();
export const redoWhiteboard = (board: PlaitBoard): void => board.redo();
export const canUndoWhiteboard = (board: PlaitBoard): boolean => board.history.undos.length > 0;
export const canRedoWhiteboard = (board: PlaitBoard): boolean => board.history.redos.length > 0;
