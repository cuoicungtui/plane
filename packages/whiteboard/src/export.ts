import { findElements, getRectangleByElements, toImage, toSvgData } from "@plait/core";
import type { PlaitBoard } from "@plait/core";

// `inlineStyleClassNames` copies computed styles onto text nodes so the exported
// image keeps the board's typography (measured in the read-only board of the spike).
const EXPORT_DEFAULTS = {
  fillStyle: "white",
  inlineStyleClassNames: ".extend,.emojis,.text",
  padding: 20,
} as const;

/** Longest an export may take before it is given up on. */
export const WHITEBOARD_EXPORT_TIMEOUT_MS = 10_000;

/**
 * Most pixels a PNG may have. Browsers refuse canvases past a size limit (Safari's is the lowest, about
 * 16 million pixels) and then hand back an empty `data:,` URL, so the pixel ratio is lowered for big boards.
 */
const MAX_PNG_PIXELS = 16_000_000;

export type WhiteboardExportOptions = {
  /** Pixel ratio of the PNG. Defaults to 2; lowered when the board is too large for that. */
  ratio?: number;
  padding?: number;
  /** CSS colour behind transparent areas. Defaults to white. */
  fillStyle?: string;
  /** Give up after this long. Defaults to `WHITEBOARD_EXPORT_TIMEOUT_MS`. */
  timeoutMs?: number;
};

/**
 * Plait's export never settles when an embedded image cannot be fetched (its fetch has no error
 * path), so every export races a timer. The abandoned export keeps running in the background but
 * nothing waits for it any more.
 */
const withTimeout = async <T>(work: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Whiteboard export timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    return await Promise.race([work, timedOut]);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * The pixel ratio to use so that the PNG of `board` stays within `MAX_PNG_PIXELS`. Plait sizes the
 * canvas as the elements' rectangle times the ratio; the padding is squeezed inside that rectangle
 * (so it also shrinks the drawing slightly) rather than added around it.
 */
const fitRatio = (board: PlaitBoard, wanted: number): number => {
  const elements = findElements(board, { match: () => true, recursion: () => true, isReverse: false });
  const { width, height } = getRectangleByElements(board, elements, false);
  const area = width * height;
  if (!(area > 0)) return wanted;
  return Math.min(wanted, Math.sqrt(MAX_PNG_PIXELS / area));
};

/**
 * Render the whole board (not just the visible part) as a PNG data URL. Rejects when the export
 * times out; resolves to `undefined` when the browser could not turn the drawing into an image.
 */
export const exportWhiteboardPng = async (
  board: PlaitBoard,
  { ratio = 2, timeoutMs = WHITEBOARD_EXPORT_TIMEOUT_MS, ...options }: WhiteboardExportOptions = {}
): Promise<string | undefined> =>
  withTimeout(toImage(board, { ...EXPORT_DEFAULTS, ...options, ratio: fitRatio(board, ratio) }), timeoutMs);

/** Render the whole board as a standalone SVG document string. Rejects when the export times out. */
export const exportWhiteboardSvg = async (
  board: PlaitBoard,
  { timeoutMs = WHITEBOARD_EXPORT_TIMEOUT_MS, ...options }: WhiteboardExportOptions = {}
): Promise<string> => withTimeout(toSvgData(board, { ...EXPORT_DEFAULTS, ...options }), timeoutMs);
