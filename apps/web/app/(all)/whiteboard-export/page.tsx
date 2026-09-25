/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { getEditorAssetSrc } from "@plane/utils";
import { renderWhiteboardPng } from "@plane/whiteboard";
import { PageWhiteboardService } from "@/services/page";
import type { Route } from "./+types/page";

const whiteboardService = new PageWhiteboardService();

// apps/live gives up on this page after 15 s (its RENDER_TIMEOUT_MS), so drawing gets a little less
// than that and fails with the error flag rather than leaving the caller to time out.
const RENDER_TIMEOUT_MS = 12_000;

// apps/live's headless-browser PDF export navigates here, waits for one of the
// flags below, and reads the PNG the page drew — see
// apps/live/src/services/whiteboard/whiteboard-render.service.ts. This route is
// never opened by a real user; it exists so the board is drawn by the same
// renderer the editor uses (canvas code that must stay out of apps/live).
//
// `__EXPORT_IMAGE__` is a PNG data URL. It is left unset when there is nothing to
// draw (an empty board, or an old Excalidraw board), which the caller reads as
// "use the placeholder text".
declare global {
  interface Window {
    __EXPORT_READY__?: boolean;
    __EXPORT_ERROR__?: boolean;
    __EXPORT_IMAGE__?: string;
  }
}

function WhiteboardExportPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId, pageId, boardId } = params;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const board = await whiteboardService.retrieve(workspaceSlug, projectId, pageId, boardId);
        const image =
          board.engine === "plait"
            ? await renderWhiteboardPng(board.scene, {
                resolveUrl: (assetId) => getEditorAssetSrc({ assetId, projectId, workspaceSlug }),
                timeoutMs: RENDER_TIMEOUT_MS,
              })
            : null;
        if (cancelled) return;
        if (image) window.__EXPORT_IMAGE__ = image;
        window.__EXPORT_READY__ = true;
      } catch {
        if (!cancelled) window.__EXPORT_ERROR__ = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, projectId, pageId, boardId]);

  return null;
}

export default WhiteboardExportPage;
