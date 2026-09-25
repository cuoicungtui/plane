import { BoardCreationMode, setCreationMode } from "@plait/common";
import { BoardTransforms, PlaitPointerType } from "@plait/core";
import type { PlaitBoard } from "@plait/core";
import { ArrowLineShape, BasicShapes } from "@plait/draw";
import { MindPointerType } from "@plait/mind";

export type WhiteboardTool =
  | "select"
  | "hand"
  | "mind"
  | "text"
  | "rectangle"
  | "roundRectangle"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "arrow"
  | "elbowArrow";

type CreationTool = Exclude<WhiteboardTool, "select" | "hand">;

/** Tools that place something when the user drags/clicks on the canvas. */
const CREATION_POINTERS: Record<CreationTool, string> = {
  mind: MindPointerType.mind,
  text: BasicShapes.text,
  rectangle: BasicShapes.rectangle,
  roundRectangle: BasicShapes.roundRectangle,
  ellipse: BasicShapes.ellipse,
  diamond: BasicShapes.diamond,
  triangle: BasicShapes.triangle,
  arrow: ArrowLineShape.straight,
  elbowArrow: ArrowLineShape.elbow,
};

/**
 * Switch the active tool.
 *
 * Setting only the pointer type is not enough for creation tools: Plait draws
 * nothing until the board also has a creation mode, and that mode is unset by
 * default.
 */
export const setWhiteboardTool = (board: PlaitBoard, tool: WhiteboardTool): void => {
  if (tool === "select") {
    BoardTransforms.updatePointerType(board, PlaitPointerType.selection);
    return;
  }
  if (tool === "hand") {
    BoardTransforms.updatePointerType(board, PlaitPointerType.hand);
    return;
  }
  BoardTransforms.updatePointerType(board, CREATION_POINTERS[tool] as never);
  setCreationMode(board, BoardCreationMode.drawing);
};

/**
 * The tool matching the board's current pointer. Plait switches back to the
 * selection pointer by itself once an element has been placed, so a toolbar
 * reads this instead of remembering the last button that was pressed.
 */
export const whiteboardToolFromBoard = (board: PlaitBoard): WhiteboardTool => {
  const pointer = board.pointer as string;
  if (pointer === PlaitPointerType.hand) return "hand";
  const creationTools = Object.keys(CREATION_POINTERS) as CreationTool[];
  return creationTools.find((tool) => CREATION_POINTERS[tool] === pointer) ?? "select";
};
