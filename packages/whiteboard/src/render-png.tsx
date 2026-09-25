import type { PlaitBoard } from "@plait/core";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { exportWhiteboardPng } from "./export";
import { collectWhiteboardAssetIds } from "./images";
import type { WhiteboardImages } from "./images";
import { isWhiteboardScene } from "./scene";
import type { WhiteboardScene } from "./scene";
import { WhiteboardCanvas } from "./whiteboard-canvas";

/** Size of the hidden board. Plait exports the whole scene whatever this is, but text is measured in it. */
const HOST_WIDTH = 1400;
const HOST_HEIGHT = 900;
/** The board counts as drawn once its markup has not changed for this long (text is rendered a tick after the board). */
const QUIET_MS = 120;
/** ... but drawing is never waited on for longer than this. */
const MAX_QUIET_WAIT_MS = 3000;
/** Budget for the whole render, images included. */
const DEFAULT_TIMEOUT_MS = 20_000;
const TIMEOUT_MESSAGE = "Whiteboard render timed out";

/** Stands in for an image that could not be loaded: the same pale grey the canvas shows for a broken image. */
const BROKEN_IMAGE_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="rgba(128,128,128,0.14)"/></svg>'
)}`;

export type RenderWhiteboardPngOptions = {
  /** Where to fetch the file of a stored asset ID (the same function the canvas uses to draw images). */
  resolveUrl: (assetId: string) => string | undefined;
  /** Pixel ratio of the PNG. Defaults to 2; lowered for very large boards (see `exportWhiteboardPng`). */
  ratio?: number;
  /** Budget for the whole render, images included. Defaults to 20 seconds. */
  timeoutMs?: number;
};

/**
 * Reject as soon as `signal` aborts, whatever `work` is doing. The listeners stay until the signal
 * fires, which `renderWhiteboardPng` always does once it is done.
 */
const until = <T,>(work: Promise<T>, signal: AbortSignal): Promise<T> => {
  const aborted = new Promise<never>((_, reject) => {
    if (signal.aborted) reject(new Error(TIMEOUT_MESSAGE));
    signal.addEventListener("abort", () => reject(new Error(TIMEOUT_MESSAGE)), { once: true });
  });
  return Promise.race([work, aborted]);
};

const readAsDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Could not read the image")));
    reader.readAsDataURL(blob);
  });

const fetchAsDataUrl = async (url: string, signal: AbortSignal): Promise<string> => {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Image request failed (${response.status})`);
  return readAsDataUrl(await response.blob());
};

/**
 * Load every image of the scene up front and hand the board data URLs. Plait's own export fetches
 * images itself and hangs when one fails; with data URLs it needs no network at all, and an image
 * that could not be loaded is drawn as a pale frame instead of failing the whole export.
 */
const prefetchImages = async (
  scene: WhiteboardScene,
  resolveUrl: RenderWhiteboardPngOptions["resolveUrl"],
  signal: AbortSignal
): Promise<WhiteboardImages> => {
  const loaded = new Map<string, string>();
  await Promise.all(
    collectWhiteboardAssetIds(scene.children).map(async (assetId) => {
      const url = resolveUrl(assetId);
      if (!url) return;
      try {
        loaded.set(assetId, await fetchAsDataUrl(url, signal));
      } catch {
        // Left out on purpose: `resolveUrl` below answers with the broken-image frame.
      }
    })
  );
  return { resolveUrl: (assetId) => loaded.get(assetId) ?? BROKEN_IMAGE_URL };
};

/** Off screen but laid out, so that text can be measured. */
const createHost = (): HTMLDivElement => {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = [
    "position:fixed",
    "left:-100000px",
    "top:0",
    `width:${HOST_WIDTH}px`,
    `height:${HOST_HEIGHT}px`,
    "overflow:hidden",
    "pointer-events:none",
  ].join(";");
  document.body.append(host);
  return host;
};

const mountBoard = (root: Root, scene: WhiteboardScene, images: WhiteboardImages): Promise<PlaitBoard> =>
  new Promise<PlaitBoard>((resolve) => {
    // The saved zoom is left out: it has no effect on an export and the board starts at 100%.
    root.render(
      <WhiteboardCanvas initialScene={{ children: scene.children }} readOnly images={images} onReady={resolve} />
    );
  });

/**
 * Plait draws text through React roots of its own, which render a moment after the board reports
 * ready, and measures it afterwards. Watching the markup until it stops changing is the only signal.
 */
const waitForQuiet = (target: Node): Promise<void> =>
  new Promise<void>((resolve) => {
    let quietTimer = 0;
    let maxTimer = 0;
    const observer = new MutationObserver(() => {
      window.clearTimeout(quietTimer);
      quietTimer = window.setTimeout(done, QUIET_MS);
    });
    function done() {
      observer.disconnect();
      window.clearTimeout(quietTimer);
      window.clearTimeout(maxTimer);
      resolve();
    }
    observer.observe(target, { childList: true, subtree: true, attributes: true, characterData: true });
    quietTimer = window.setTimeout(done, QUIET_MS);
    maxTimer = window.setTimeout(done, MAX_QUIET_WAIT_MS);
  });

/**
 * Draw a saved whiteboard to a PNG data URL, off screen. This is the one place that turns a stored
 * scene into an image, for both the PDF export in the browser and the headless export page.
 *
 * `scene` is the stored JSON as it comes from the API. Resolves to `null` when there is nothing to
 * draw (an empty board, or a scene of another engine such as the old Excalidraw boards), so callers
 * fall back to their placeholder text. Rejects when rendering fails or runs out of time.
 */
export const renderWhiteboardPng = async (
  scene: unknown,
  { resolveUrl, ratio, timeoutMs = DEFAULT_TIMEOUT_MS }: RenderWhiteboardPngOptions
): Promise<string | null> => {
  if (!isWhiteboardScene(scene) || scene.children.length === 0) return null;

  const startedAt = performance.now();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const host = createHost();
  const root = createRoot(host);
  try {
    const images = await until(prefetchImages(scene, resolveUrl, controller.signal), controller.signal);
    const board = await until(mountBoard(root, scene, images), controller.signal);
    await until(waitForQuiet(host), controller.signal);
    await until(document.fonts?.ready ?? Promise.resolve(), controller.signal);
    const png = await exportWhiteboardPng(board, {
      ratio,
      timeoutMs: Math.max(1, timeoutMs - (performance.now() - startedAt)),
    });
    if (!png?.startsWith("data:image/png")) throw new Error("The whiteboard could not be turned into an image");
    return png;
  } finally {
    window.clearTimeout(timer);
    controller.abort();
    root.unmount();
    host.remove();
  }
};
