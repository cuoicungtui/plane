/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { WhiteboardShape } from "@plane/whiteboard";

const CIRCLE = "M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0";
const DIAMOND = "M12 3l9 9-9 9-9-9z";
const PARALLELOGRAM = "M8 6h13l-5 12H3z";

/** Outline of every shape in the picker, drawn in a 24 x 24 box. */
const GLYPH_PATHS: Record<WhiteboardShape, string> = {
  rectangle: "M4 6h16v12H4z",
  ellipse: "M3 12a9 6 0 1 0 18 0a9 6 0 1 0 -18 0",
  diamond: DIAMOND,
  roundRectangle: "M7 6h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z",
  parallelogram: PARALLELOGRAM,
  triangle: "M12 4l9 16H3z",
  leftArrow: "M3 12l7-7v4h11v6H10v4z",
  trapezoid: "M7 6h10l4 12H3z",
  rightArrow: "M21 12l-7-7v4H3v6h11v4z",
  cross: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  pentagon: "M12 3l9 6.5-3.5 10.5h-11L3 9.5z",
  hexagon: "M7 4h10l5 8-5 8H7l-5-8z",
  octagon: "M8 3h8l5 5v8l-5 5H8l-5-5V8z",
  pentagonArrow: "M3 6h13l5 6-5 6H3z",
  processArrow: "M3 6h12l6 6-6 6H3l5-6z",
  twoWayArrow: "M2 12l5-6v4h10V6l5 6-5 6v-4H7v4z",
  comment: "M4 4h16v12h-8l-5 4v-4H4z",
  roundComment: "M7 4h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-6l-4 4v-4a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z",
  cloud: "M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8.5a4.5 4.5 0 0 1 .5 9.5z",
  process: "M3 6h18v12H3z",
  decision: DIAMOND,
  data: PARALLELOGRAM,
  connector: CIRCLE,
  terminal: "M8 6h8a6 6 0 0 1 0 12H8a6 6 0 0 1 0-12z",
  manualInput: "M3 9l18-4v13H3z",
  preparation: "M6 6h12l4 6-4 6H6l-4-6z",
  manualLoop: "M3 5h18l-3 14H6z",
  merge: "M3 5h18l-9 14z",
  delay: "M3 5h9a7 7 0 0 1 0 14H3z",
  storedData: "M6 5h15a3 3 0 0 0 0 14H6a3 3 0 0 0 0-14z",
  or: `${CIRCLE}M12 4v16M4 12h16`,
  summingJunction: `${CIRCLE}M6.3 6.3l11.4 11.4M17.7 6.3L6.3 17.7`,
  predefinedProcess: "M3 6h18v12H3zM7 6v12M17 6v12",
  offPage: "M4 4h16v10l-8 6-8-6z",
  document: "M4 5h16v12c-4-3-6 3-8 0s-4 3-8 0z",
  multiDocument: "M7 4h13v10M4 7h13v11c-3-2-5 2-6.5 0S6 20 4 18z",
  database: "M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3v12c0 1.7-3.1 3-7 3s-7-1.3-7-3zM5 6c0 1.7 3.1 3 7 3s7-1.3 7-3",
  hardDisk: "M7 6h10a4 6 0 0 1 0 12H7a4 6 0 0 1 0-12zM17 6a4 6 0 0 0 0 12",
  internalStorage: "M3 5h18v14H3zM8 5v14M3 10h18",
  noteCurlyRight: "M8 4c-3 0-3 2-3 4s0 3-2 4c2 1 2 2 2 4s0 4 3 4M12 12h9",
  noteCurlyLeft: "M16 4c3 0 3 2 3 4s0 3 2 4c-2 1-2 2-2 4s0 4-3 4M12 12H3",
  noteSquare: "M10 4H5v16h5M5 12h16",
  display: "M3 12l4-7h11a4 7 0 0 1 0 14H7z",
};

export function WhiteboardShapeGlyph({ shape, className }: { shape: WhiteboardShape; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden
      className={className}
    >
      <path d={GLYPH_PATHS[shape]} />
    </svg>
  );
}
