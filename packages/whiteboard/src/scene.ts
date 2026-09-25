import type { PlaitBoard, PlaitElement } from "@plait/core";

/** Stored in `PageWhiteboard.engine` / `schema_version` (see apps/api serializers/whiteboard.py). */
export const WHITEBOARD_ENGINE = "plait";
export const WHITEBOARD_SCHEMA_VERSION = 2;

/**
 * The persisted shape of a whiteboard (schema v2). It mirrors what the API
 * accepts: only the element tree, the zoom level and the colour mode are kept.
 * Scroll position is recomputed on load.
 */
export type WhiteboardScene = {
  children: PlaitElement[];
  viewport?: { zoom: number };
  theme?: { themeColorMode: string };
};

export const createEmptyScene = (): WhiteboardScene => ({ children: [] });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * True when `value` looks like a v2 scene. Legacy Excalidraw scenes
 * (`{ elements, files }`) return false, which callers use to show the
 * "no longer supported" frame instead of a canvas.
 */
export const isWhiteboardScene = (value: unknown): value is WhiteboardScene =>
  isRecord(value) &&
  Array.isArray(value.children) &&
  value.children.every((element) => isRecord(element) && typeof element.id === "string" && element.id !== "");

/** Snapshot a live board into the persisted shape. */
export const sceneFromBoard = (board: PlaitBoard): WhiteboardScene => ({
  children: board.children,
  viewport: { zoom: board.viewport?.zoom ?? 1 },
  theme: { themeColorMode: board.theme?.themeColorMode ?? "default" },
});
