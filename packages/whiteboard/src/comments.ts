import {
  addSelectedElement,
  clearSelectedElement,
  getElementById,
  getRectangleByElements,
  getSelectedElements,
  toHostPointFromViewBoxPoint,
  toScreenPointFromHostPoint,
} from "@plait/core";
import type { PlaitBoard } from "@plait/core";

/** The ID of the selected element, or null unless exactly one element is selected. */
export const getSingleSelectedWhiteboardElementId = (board: PlaitBoard): string | null => {
  const selected = getSelectedElements(board);
  return selected.length === 1 && typeof selected[0].id === "string" ? selected[0].id : null;
};

export const hasWhiteboardElement = (board: PlaitBoard, elementId: string): boolean =>
  !!getElementById(board, elementId);

/** Selects a single element by ID, replacing the current selection. Returns false when it no longer exists. */
export const selectWhiteboardElement = (board: PlaitBoard, elementId: string): boolean => {
  const element = getElementById(board, elementId);
  if (!element) return false;
  clearSelectedElement(board);
  addSelectedElement(board, element);
  return true;
};

/**
 * Where the top-right corner of an element is drawn, in client (window) pixels.
 * Null when the element no longer exists.
 */
export const getWhiteboardElementClientPoint = (
  board: PlaitBoard,
  elementId: string
): { x: number; y: number } | null => {
  const element = getElementById(board, elementId);
  if (!element) return null;
  const rect = getRectangleByElements(board, [element], false);
  const [x, y] = toScreenPointFromHostPoint(board, toHostPointFromViewBoxPoint(board, [rect.x + rect.width, rect.y]));
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};
