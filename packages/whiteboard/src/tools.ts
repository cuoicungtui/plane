import { BoardCreationMode, setCreationMode } from "@plait/common";
import { BoardTransforms, PlaitPointerType } from "@plait/core";
import type { PlaitBoard } from "@plait/core";
import { ArrowLineShape, BasicShapes, FlowchartSymbols } from "@plait/draw";
import { MindPointerType } from "@plait/mind";

/** Basic shapes offered in the shape picker (the text box is its own tool). */
export const WHITEBOARD_BASIC_SHAPES = Object.values(BasicShapes).filter(
  (shape) => shape !== BasicShapes.text
) as Exclude<BasicShapes, BasicShapes.text>[];

/** Flowchart symbols offered in the shape picker. */
export const WHITEBOARD_FLOWCHART_SHAPES = Object.values(FlowchartSymbols) as FlowchartSymbols[];

/** The value of a shape enum member, which is also its Plait pointer type and the `shape` of the element. */
export type WhiteboardShape = `${Exclude<BasicShapes, BasicShapes.text>}` | `${FlowchartSymbols}`;

export type WhiteboardTool =
  | "select"
  | "hand"
  | "mind"
  | "text"
  | "arrow"
  | "elbowArrow"
  | "curveArrow"
  | WhiteboardShape;

type NonShapeCreationTool = Exclude<WhiteboardTool, "select" | "hand" | WhiteboardShape>;

const SHAPE_TOOLS: ReadonlySet<string> = new Set<string>([...WHITEBOARD_BASIC_SHAPES, ...WHITEBOARD_FLOWCHART_SHAPES]);

/** Tools that place something other than a shape when the user drags/clicks on the canvas. */
const CREATION_POINTERS: Record<NonShapeCreationTool, string> = {
  mind: MindPointerType.mind,
  text: BasicShapes.text,
  arrow: ArrowLineShape.straight,
  elbowArrow: ArrowLineShape.elbow,
  curveArrow: ArrowLineShape.curve,
};

export const isWhiteboardShape = (value: string): value is WhiteboardShape => SHAPE_TOOLS.has(value);

const pointerForTool = (tool: NonShapeCreationTool | WhiteboardShape): string =>
  isWhiteboardShape(tool) ? tool : CREATION_POINTERS[tool];

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
  BoardTransforms.updatePointerType(board, pointerForTool(tool) as never);
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
  if (isWhiteboardShape(pointer)) return pointer;
  const creationTools = Object.keys(CREATION_POINTERS) as NonShapeCreationTool[];
  return creationTools.find((tool) => CREATION_POINTERS[tool] === pointer) ?? "select";
};
