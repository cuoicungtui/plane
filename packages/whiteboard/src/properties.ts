import { AlignTransform, PropertyTransforms, getTextEditorsByElement } from "@plait/common";
import type { Alignment, StrokeStyle } from "@plait/common";
import { Transforms, canSetZIndex, deleteFragment, duplicateElements, getSelectedElements } from "@plait/core";
import type { PlaitBoard, PlaitElement } from "@plait/core";
import {
  ArrowLineHandleKey,
  ArrowLineMarkerType,
  DrawTransforms,
  PlaitDrawElement,
  getFillByElement as getDrawFill,
  getStrokeColorByElement as getDrawStrokeColor,
  getStrokeStyleByElement as getDrawStrokeStyle,
  getStrokeWidthByElement as getDrawStrokeWidth,
} from "@plait/draw";
import type { ArrowLineShape, PlaitArrowLine, PlaitGeometry } from "@plait/draw";
import type { MindLayoutType } from "@plait/layouts";
import {
  MindElement,
  MindTransforms,
  getBranchShapeByMindElement,
  getBranchWidthByMindElement,
  getDefaultFontSizeForMindElement,
  getFillByElement as getMindFill,
  getFontSizeByMindElement,
  getRootLayout,
  getShapeByElement as getMindShape,
  getStrokeColorByElement as getMindStrokeColor,
  getStrokeStyleByElement as getMindStrokeStyle,
  getStrokeWidthByElement as getMindStrokeWidth,
} from "@plait/mind";
import type { BranchShape, MindElementShape } from "@plait/mind";
import { DEFAULT_FONT_SIZE, MarkTypes, TextTransforms, getTextMarksByElement } from "@plait/text-plugins";
import type { FontSizes } from "@plait/text-plugins";
import type { WhiteboardShape } from "./tools";

export type WhiteboardStrokeStyle = `${StrokeStyle}`;
export type WhiteboardTextAlign = "left" | "center" | "right";
export type WhiteboardTextMark = "bold" | "italic" | "underline" | "strike";
export type WhiteboardArrowShape = `${ArrowLineShape}`;
export type WhiteboardArrowMarker = `${ArrowLineMarkerType}`;
export type WhiteboardArrowEnd = "source" | "target";
export type WhiteboardMindShape = `${MindElementShape}`;
export type WhiteboardBranchShape = `${BranchShape}`;
export type WhiteboardAlignment = "left" | "horizontalCenter" | "right" | "top" | "verticalCenter" | "bottom";
export type WhiteboardDistribution = "horizontal" | "vertical";
export type WhiteboardLayerMove = "front" | "forward" | "backward" | "back";

/** Font sizes offered in the property bar. */
export const WHITEBOARD_FONT_SIZES: readonly number[] = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48];
export const WHITEBOARD_STROKE_WIDTHS: readonly number[] = [1, 2, 4, 6];
export const WHITEBOARD_STROKE_STYLES: readonly WhiteboardStrokeStyle[] = ["solid", "dashed", "dotted"];
export const WHITEBOARD_ARROW_SHAPES: readonly WhiteboardArrowShape[] = ["straight", "elbow", "curve"];
export const WHITEBOARD_ARROW_MARKERS: readonly WhiteboardArrowMarker[] = [
  ArrowLineMarkerType.none,
  ArrowLineMarkerType.arrow,
  ArrowLineMarkerType.openTriangle,
  ArrowLineMarkerType.solidTriangle,
  ArrowLineMarkerType.sharpArrow,
  ArrowLineMarkerType.hollowTriangle,
];
export const WHITEBOARD_MIND_LAYOUTS: readonly string[] = [
  "right",
  "left",
  "standard",
  "upward",
  "downward",
  "right-bottom-indented",
  "right-top-indented",
  "left-bottom-indented",
  "left-top-indented",
];
export const WHITEBOARD_MIND_SHAPES: readonly WhiteboardMindShape[] = ["round-rectangle", "underline"];
export const WHITEBOARD_BRANCH_SHAPES: readonly WhiteboardBranchShape[] = ["bight", "polyline"];
export const WHITEBOARD_BRANCH_WIDTHS: readonly number[] = [1, 2, 3, 4, 6];

/** What the current selection is made of and how it is styled; `null` means "not applicable / unknown". */
export type WhiteboardSelection = {
  count: number;
  hasGeometry: boolean;
  hasArrow: boolean;
  hasMind: boolean;
  hasImage: boolean;
  /** Shapes and mind nodes can be filled; lines and text boxes cannot. */
  canFill: boolean;
  /** Shapes, lines and mind nodes have an outline. */
  canStroke: boolean;
  /** Shapes, text boxes and mind nodes carry text. */
  canStyleText: boolean;
  fill: string | null;
  strokeColor: string | null;
  strokeWidth: number | null;
  strokeStyle: WhiteboardStrokeStyle | null;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  fontSize: number | null;
  textColor: string | null;
  textAlign: WhiteboardTextAlign | null;
  shape: string | null;
  arrowShape: WhiteboardArrowShape | null;
  arrowSource: WhiteboardArrowMarker | null;
  arrowTarget: WhiteboardArrowMarker | null;
  mindLayout: string | null;
  mindShape: WhiteboardMindShape | null;
  branchShape: WhiteboardBranchShape | null;
  branchWidth: number | null;
  canReorder: boolean;
  canAlign: boolean;
  canDistribute: boolean;
};

export const EMPTY_WHITEBOARD_SELECTION: WhiteboardSelection = {
  count: 0,
  hasGeometry: false,
  hasArrow: false,
  hasMind: false,
  hasImage: false,
  canFill: false,
  canStroke: false,
  canStyleText: false,
  fill: null,
  strokeColor: null,
  strokeWidth: null,
  strokeStyle: null,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  fontSize: null,
  textColor: null,
  textAlign: null,
  shape: null,
  arrowShape: null,
  arrowSource: null,
  arrowTarget: null,
  mindLayout: null,
  mindShape: null,
  branchShape: null,
  branchWidth: null,
  canReorder: false,
  canAlign: false,
  canDistribute: false,
};

export const whiteboardSelectionEquals = (a: WhiteboardSelection, b: WhiteboardSelection): boolean =>
  (Object.keys(a) as (keyof WhiteboardSelection)[]).every((key) => a[key] === b[key]);

const isShape = (element: PlaitElement): element is PlaitGeometry =>
  PlaitDrawElement.isGeometry(element) && !PlaitDrawElement.isText(element);

const isMind = (board: PlaitBoard, element: PlaitElement): element is MindElement =>
  MindElement.isMindElement(board, element);

const carriesText = (board: PlaitBoard, element: PlaitElement): boolean =>
  PlaitDrawElement.isGeometry(element) || isMind(board, element);

const canFillElement = (board: PlaitBoard, element: PlaitElement): boolean =>
  isShape(element) || isMind(board, element);

const canStrokeElement = (board: PlaitBoard, element: PlaitElement): boolean =>
  isShape(element) || PlaitDrawElement.isArrowLine(element) || isMind(board, element);

const asText = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const asNumber = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
};

const readTextAlign = (element: PlaitElement): WhiteboardTextAlign | null => {
  const editor = getTextEditorsByElement(element)[0];
  const align = (editor?.children[0] as { align?: string } | undefined)?.align;
  return align === "left" || align === "center" || align === "right" ? align : null;
};

/** Reads the state of the current selection for a property bar. Cheap enough to call on every board change. */
export const readWhiteboardSelection = (board: PlaitBoard): WhiteboardSelection => {
  const selected = getSelectedElements(board);
  if (selected.length === 0) return EMPTY_WHITEBOARD_SELECTION;

  const fillTarget = selected.find((element) => canFillElement(board, element));
  const strokeTarget = selected.find((element) => canStrokeElement(board, element));
  const textTarget = selected.find((element) => carriesText(board, element));
  const arrow = selected.find((element): element is PlaitArrowLine => PlaitDrawElement.isArrowLine(element));
  const mind = selected.find((element): element is MindElement => isMind(board, element));
  const geometry = selected.find((element): element is PlaitGeometry => PlaitDrawElement.isGeometry(element));

  const marks: Record<string, unknown> = textTarget
    ? (getTextMarksByElement(textTarget) as Record<string, unknown>)
    : {};
  const fillMind = fillTarget && isMind(board, fillTarget) ? fillTarget : null;
  const strokeMind = strokeTarget && isMind(board, strokeTarget) ? strokeTarget : null;

  let fontSize: number | null = null;
  if (textTarget) {
    const explicit = asNumber(marks[MarkTypes.fontSize]);
    if (explicit !== null) fontSize = explicit;
    else if (isMind(board, textTarget)) fontSize = getFontSizeByMindElement(board, textTarget);
    else fontSize = DEFAULT_FONT_SIZE;
  }

  return {
    count: selected.length,
    hasGeometry: geometry !== undefined,
    hasArrow: arrow !== undefined,
    hasMind: mind !== undefined,
    hasImage: selected.some((element) => PlaitDrawElement.isImage(element)),
    canFill: fillTarget !== undefined,
    canStroke: strokeTarget !== undefined,
    canStyleText: textTarget !== undefined,
    fill: fillTarget ? asText(fillMind ? getMindFill(board, fillMind) : getDrawFill(board, fillTarget)) : null,
    strokeColor: strokeTarget
      ? asText(strokeMind ? getMindStrokeColor(board, strokeMind) : getDrawStrokeColor(board, strokeTarget))
      : null,
    strokeWidth: strokeTarget
      ? asNumber(strokeMind ? getMindStrokeWidth(board, strokeMind) : getDrawStrokeWidth(strokeTarget))
      : null,
    strokeStyle: strokeTarget
      ? (asText(
          strokeMind ? getMindStrokeStyle(board, strokeMind) : getDrawStrokeStyle(board, strokeTarget)
        ) as WhiteboardStrokeStyle | null)
      : null,
    bold: marks[MarkTypes.bold] === true,
    italic: marks[MarkTypes.italic] === true,
    underline: marks[MarkTypes.underline] === true,
    strike: marks[MarkTypes.strike] === true,
    fontSize,
    textColor: asText(marks[MarkTypes.color]),
    textAlign: textTarget ? readTextAlign(textTarget) : null,
    shape: geometry ? String(geometry.shape) : null,
    arrowShape: arrow ? (arrow.shape as WhiteboardArrowShape) : null,
    arrowSource: arrow ? ((arrow.source?.marker ?? ArrowLineMarkerType.none) as WhiteboardArrowMarker) : null,
    arrowTarget: arrow ? ((arrow.target?.marker ?? ArrowLineMarkerType.arrow) as WhiteboardArrowMarker) : null,
    mindLayout: mind ? String(getRootLayout(MindElement.getRoot(board, mind))) : null,
    mindShape: mind ? (getMindShape(board, mind) as WhiteboardMindShape) : null,
    branchShape: mind ? (getBranchShapeByMindElement(board, mind) as WhiteboardBranchShape) : null,
    branchWidth: mind ? asNumber(getBranchWidthByMindElement(board, mind)) : null,
    canReorder: canSetZIndex(board),
    canAlign: selected.length >= 2,
    canDistribute: selected.length >= 3,
  };
};

/** Each setter changes only the selected elements it applies to. */
export const setWhiteboardFill = (board: PlaitBoard, color: string | null): void => {
  PropertyTransforms.setFillColor(board, color, { match: (element) => canFillElement(board, element) });
};

export const setWhiteboardStrokeColor = (board: PlaitBoard, color: string | null): void => {
  PropertyTransforms.setStrokeColor(board, color, { match: (element) => canStrokeElement(board, element) });
};

export const setWhiteboardStrokeWidth = (board: PlaitBoard, width: number): void => {
  PropertyTransforms.setStrokeWidth(board, width, { match: (element) => canStrokeElement(board, element) });
};

export const setWhiteboardStrokeStyle = (board: PlaitBoard, style: WhiteboardStrokeStyle): void => {
  PropertyTransforms.setStrokeStyle(board, style, { match: (element) => canStrokeElement(board, element) });
};

const MARK_TYPES: Record<WhiteboardTextMark, MarkTypes> = {
  bold: MarkTypes.bold,
  italic: MarkTypes.italic,
  underline: MarkTypes.underline,
  strike: MarkTypes.strike,
};

export const toggleWhiteboardTextMark = (board: PlaitBoard, mark: WhiteboardTextMark): void => {
  TextTransforms.setTextMarks(board, MARK_TYPES[mark]);
};

export const setWhiteboardFontSize = (board: PlaitBoard, size: number): void => {
  TextTransforms.setFontSize(board, String(size) as FontSizes, (element) =>
    element && isMind(board, element) ? getDefaultFontSizeForMindElement(element) : DEFAULT_FONT_SIZE
  );
};

export const setWhiteboardTextColor = (board: PlaitBoard, color: string | null): void => {
  TextTransforms.setTextColor(board, color ?? "transparent");
};

export const setWhiteboardTextAlign = (board: PlaitBoard, align: WhiteboardTextAlign): void => {
  TextTransforms.setTextAlign(board, align as Alignment);
};

export const setWhiteboardShape = (board: PlaitBoard, shape: WhiteboardShape): void => {
  DrawTransforms.switchGeometryShape(board, shape as never);
};

export const setWhiteboardArrowShape = (board: PlaitBoard, shape: WhiteboardArrowShape): void => {
  DrawTransforms.setArrowLineShape(board, { shape: shape as ArrowLineShape });
};

export const setWhiteboardArrowMarker = (
  board: PlaitBoard,
  end: WhiteboardArrowEnd,
  marker: WhiteboardArrowMarker
): void => {
  const key = end === "source" ? ArrowLineHandleKey.source : ArrowLineHandleKey.target;
  DrawTransforms.setArrowLineMark(board, key, marker as ArrowLineMarkerType);
};

export const setWhiteboardMindLayout = (board: PlaitBoard, layout: string): void => {
  MindTransforms.setLayout(board, layout as MindLayoutType);
};

export const setWhiteboardMindShape = (board: PlaitBoard, shape: WhiteboardMindShape): void => {
  MindTransforms.setShape(board, shape as MindElementShape);
};

export const setWhiteboardBranchShape = (board: PlaitBoard, shape: WhiteboardBranchShape): void => {
  MindTransforms.setBranchShape(board, shape as BranchShape);
};

export const setWhiteboardBranchWidth = (board: PlaitBoard, width: number): void => {
  MindTransforms.setBranchWidth(board, width);
};

const ALIGNERS: Record<WhiteboardAlignment, (board: PlaitBoard) => void> = {
  left: AlignTransform.alignLeft,
  horizontalCenter: AlignTransform.alignHorizontalCenter,
  right: AlignTransform.alignRight,
  top: AlignTransform.alignTop,
  verticalCenter: AlignTransform.alignVerticalCenter,
  bottom: AlignTransform.alignBottom,
};

export const alignWhiteboardSelection = (board: PlaitBoard, alignment: WhiteboardAlignment): void => {
  if (getSelectedElements(board).length >= 2) ALIGNERS[alignment](board);
};

export const distributeWhiteboardSelection = (board: PlaitBoard, direction: WhiteboardDistribution): void => {
  if (getSelectedElements(board).length < 3) return;
  if (direction === "horizontal") AlignTransform.distributeHorizontal(board);
  else AlignTransform.distributeVertical(board);
};

export const moveWhiteboardSelectionLayer = (board: PlaitBoard, move: WhiteboardLayerMove): void => {
  if (!canSetZIndex(board)) return;
  if (move === "front") Transforms.moveToTop(board);
  else if (move === "forward") Transforms.moveUp(board);
  else if (move === "backward") Transforms.moveDown(board);
  else Transforms.moveToBottom(board);
};

export const deleteWhiteboardSelection = (board: PlaitBoard): void => {
  if (getSelectedElements(board).length > 0) deleteFragment(board);
};

export const duplicateWhiteboardSelection = (board: PlaitBoard): void => {
  const selected = getSelectedElements(board);
  if (selected.length > 0) duplicateElements(board, selected);
};
