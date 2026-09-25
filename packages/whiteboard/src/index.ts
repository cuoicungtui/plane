// Ambient types for `is-hotkey` and `*.scss`. The package ships as source, so every app that
// imports it type-checks these files too and needs the declarations in its own program.
// oxlint-disable-next-line typescript-eslint/triple-slash-reference
/// <reference path="./env.d.ts" />

export { WhiteboardCanvas } from "./whiteboard-canvas";
export type { WhiteboardCanvasProps } from "./whiteboard-canvas";
export {
  WHITEBOARD_ENGINE,
  WHITEBOARD_SCHEMA_VERSION,
  createEmptyScene,
  isWhiteboardScene,
  sceneFromBoard,
} from "./scene";
export type { WhiteboardScene } from "./scene";
export {
  WHITEBOARD_IMAGE_TYPES,
  collectWhiteboardAssetIds,
  insertWhiteboardImages,
  isAssetId as isWhiteboardAssetId,
} from "./images";
export type { WhiteboardImageError, WhiteboardImages } from "./images";
export { DEFAULT_WHITEBOARD_LABELS } from "./plugins";
export type { WhiteboardLabels } from "./plugins";
export {
  WHITEBOARD_BASIC_SHAPES,
  WHITEBOARD_FLOWCHART_SHAPES,
  isWhiteboardShape,
  setWhiteboardTool,
  whiteboardToolFromBoard,
} from "./tools";
export type { WhiteboardShape, WhiteboardTool } from "./tools";
export {
  WHITEBOARD_ZOOM_LEVELS,
  canRedoWhiteboard,
  canUndoWhiteboard,
  fitWhiteboard,
  getWhiteboardZoom,
  redoWhiteboard,
  resetWhiteboardZoom,
  setWhiteboardZoom,
  stepWhiteboardZoom,
  undoWhiteboard,
  whiteboardZoomPercent,
  zoomWhiteboard,
} from "./view";
export {
  EMPTY_WHITEBOARD_SELECTION,
  WHITEBOARD_ARROW_MARKERS,
  WHITEBOARD_ARROW_SHAPES,
  WHITEBOARD_BRANCH_SHAPES,
  WHITEBOARD_BRANCH_WIDTHS,
  WHITEBOARD_FONT_SIZES,
  WHITEBOARD_MIND_LAYOUTS,
  WHITEBOARD_MIND_SHAPES,
  WHITEBOARD_STROKE_STYLES,
  WHITEBOARD_STROKE_WIDTHS,
  alignWhiteboardSelection,
  deleteWhiteboardSelection,
  distributeWhiteboardSelection,
  duplicateWhiteboardSelection,
  moveWhiteboardSelectionLayer,
  readWhiteboardSelection,
  setWhiteboardArrowMarker,
  setWhiteboardArrowShape,
  setWhiteboardBranchShape,
  setWhiteboardBranchWidth,
  setWhiteboardFill,
  setWhiteboardFontSize,
  setWhiteboardMindLayout,
  setWhiteboardMindShape,
  setWhiteboardShape,
  setWhiteboardStrokeColor,
  setWhiteboardStrokeStyle,
  setWhiteboardStrokeWidth,
  setWhiteboardTextAlign,
  setWhiteboardTextColor,
  toggleWhiteboardTextMark,
  whiteboardSelectionEquals,
} from "./properties";
export type {
  WhiteboardAlignment,
  WhiteboardArrowEnd,
  WhiteboardArrowMarker,
  WhiteboardArrowShape,
  WhiteboardBranchShape,
  WhiteboardDistribution,
  WhiteboardLayerMove,
  WhiteboardMindShape,
  WhiteboardSelection,
  WhiteboardStrokeStyle,
  WhiteboardTextAlign,
  WhiteboardTextMark,
} from "./properties";
export {
  getSingleSelectedWhiteboardElementId,
  getWhiteboardElementClientPoint,
  hasWhiteboardElement,
  selectWhiteboardElement,
} from "./comments";
export { WHITEBOARD_EXPORT_TIMEOUT_MS, exportWhiteboardPng, exportWhiteboardSvg } from "./export";
export type { WhiteboardExportOptions } from "./export";
export { renderWhiteboardPng } from "./render-png";
export type { RenderWhiteboardPngOptions } from "./render-png";
export type { PlaitBoard } from "@plait/core";
