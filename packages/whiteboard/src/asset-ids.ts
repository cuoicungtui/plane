import type { PlaitElement } from "@plait/core";

// Nothing here may import Plait, Slate or React as a value (type imports are erased, so they are fine).
// The web app imports this file as `@plane/whiteboard/asset-ids` from code that ships in its main
// bundle; going through the package root instead would pull the whole board (Plait, Slate, rough.js,
// ~550 KB) into every page load. tests/lazy-boundary.test.ts keeps it that way.

const ASSET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `value` is a stored asset ID rather than a URL (used for images from before or outside the board). */
export const isAssetId = (value: unknown): value is string => typeof value === "string" && ASSET_ID_PATTERN.test(value);

const collectFromElement = (element: unknown, found: Set<string>): void => {
  if (typeof element !== "object" || element === null) return;
  const { url, data, children } = element as {
    url?: unknown;
    data?: { image?: { url?: unknown } };
    children?: unknown;
  };
  // A free-standing image element, and an image attached to a mind map node.
  if (isAssetId(url)) found.add(url);
  if (isAssetId(data?.image?.url)) found.add(data.image.url);
  if (Array.isArray(children)) {
    for (const child of children) collectFromElement(child, found);
  }
};

/**
 * Every asset ID a scene refers to (free-standing images and images on mind map nodes), for the
 * `asset_ids` sent with each save.
 */
export const collectWhiteboardAssetIds = (elements: PlaitElement[]): string[] => {
  const found = new Set<string>();
  for (const element of elements) collectFromElement(element, found);
  return [...found];
};
