/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { logger } from "@plane/logger";
import { env } from "@/env";

export type WhiteboardRenderParams = {
  workspaceSlug: string;
  projectId: string;
  pageId: string;
  boardId: string;
  cookie: string;
};

const RENDER_TIMEOUT_MS = 15000;
const VIEWPORT = { width: 1400, height: 900 };

// A single headless Chromium instance is reused across export requests — each
// render only opens its own short-lived context/page on top of it. Launching
// Chromium fresh per request would dominate export latency (real-world cold
// start is 300ms+) for something PDF exports already do serially per page.
let browserPromise: Promise<Browser> | null = null;

const getBrowser = (): Promise<Browser> => {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: true,
        executablePath: env.CHROMIUM_EXECUTABLE_PATH,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      })
      .catch((cause) => {
        browserPromise = null;
        throw cause;
      });
  }
  return browserPromise;
};

export const closeWhiteboardRenderBrowser = async (): Promise<void> => {
  if (!browserPromise) return;
  const current = browserPromise;
  browserPromise = null;
  const browser = await current.catch(() => null);
  await browser?.close().catch(() => {});
};

// The cookie is a raw `Cookie:` header string (see PdfExportInput.cookie), not
// structured per-domain data. Applying each pair to both the web app's and
// the API's origin lets the export page's own cross-origin, credentialed
// fetches (PageWhiteboardService, asset downloads) work exactly as they would
// in the real signed-in browser that request came from.
const parseCookiesForUrls = (cookieHeader: string, urls: string[]) => {
  const cookies: { name: string; value: string; url: string }[] = [];
  for (const pair of cookieHeader.split(";")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const name = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!name) continue;
    for (const url of urls) {
      cookies.push({ name, value, url });
    }
  }
  return cookies;
};

/**
 * Renders a whiteboard's real drawn content to a PNG data URI by navigating a
 * headless browser to apps/web's `/whiteboard-export/...` route, which draws the
 * board with the same Plait renderer the editor uses and publishes the PNG it made
 * as `window.__EXPORT_IMAGE__`. Returns null on any failure — and when there is
 * nothing to draw (an empty board, or an old Excalidraw board) — so callers can
 * fall back to the text placeholder: a missing whiteboard image must never fail
 * the whole PDF export.
 */
export const renderWhiteboardImage = async (params: WhiteboardRenderParams): Promise<string | null> => {
  if (!env.WEB_BASE_URL) return null;

  const { workspaceSlug, projectId, pageId, boardId, cookie } = params;
  let context: BrowserContext | undefined;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({ viewport: VIEWPORT });
    await context.addCookies(parseCookiesForUrls(cookie, [env.WEB_BASE_URL, env.API_BASE_URL]));

    const page = await context.newPage();
    const url = `${env.WEB_BASE_URL}/whiteboard-export/${workspaceSlug}/${projectId}/${pageId}/${boardId}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: RENDER_TIMEOUT_MS });
    // `window` isn't in this project's (DOM-less) tsconfig lib; this callback runs
    // inside the browser page, not this Node process, so `globalThis as any` is only
    // sidestepping a type-checking limitation, not a runtime concern.
    await page.waitForFunction(
      () => (globalThis as any).__EXPORT_READY__ === true || (globalThis as any).__EXPORT_ERROR__ === true,
      { timeout: RENDER_TIMEOUT_MS }
    );

    const failed = await page.evaluate(() => (globalThis as any).__EXPORT_ERROR__ === true);
    if (failed) return null;

    const image = await page.evaluate(() => (globalThis as any).__EXPORT_IMAGE__ as unknown);
    return typeof image === "string" && image.startsWith("data:image/png") ? image : null;
  } catch (error) {
    logger.warn("PDF_EXPORT: Whiteboard render failed", { boardId, error: String(error) });
    return null;
  } finally {
    await context?.close().catch(() => {});
  }
};
