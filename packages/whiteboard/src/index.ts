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
export { setWhiteboardTool, whiteboardToolFromBoard } from "./tools";
export type { WhiteboardTool } from "./tools";
export { WHITEBOARD_EXPORT_TIMEOUT_MS, exportWhiteboardPng, exportWhiteboardSvg } from "./export";
export type { WhiteboardExportOptions } from "./export";
export { renderWhiteboardPng } from "./render-png";
export type { RenderWhiteboardPngOptions } from "./render-png";
export type { PlaitBoard } from "@plait/core";
