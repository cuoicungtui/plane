/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
// eslint-disable-next-line import/no-unassigned-import -- stylesheet import, nothing to bind
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { getEditorAssetSrc } from "@plane/utils";
import { PageWhiteboardService } from "@/services/page";
import type { Route } from "./+types/page";

const whiteboardService = new PageWhiteboardService();

// apps/live's headless-browser PDF export navigates here, waits for one of
// these flags, and screenshots the `.excalidraw` element — see
// apps/live/src/services/whiteboard/whiteboard-render.service.ts. This route
// is never opened by a real user; it exists purely so the real Excalidraw
// renderer (canvas code that must stay out of apps/live) can produce a
// pixel-perfect PNG of a board's actual content for embedding in exported PDFs.
declare global {
  interface Window {
    __EXPORT_READY__?: boolean;
    __EXPORT_ERROR__?: boolean;
  }
}

type ExcalidrawFile = { id: string; dataURL: string; mimeType: string; created: number };
// `files` is passed through as `any` to Excalidraw's `initialData`, matching
// page-whiteboard-embed.tsx: BinaryFileData's `mimeType` is a narrow union of
// known image types, but blob.type is a plain string we can't narrow safely.
type Scene = {
  elements: Record<string, unknown>[];
  appState: Record<string, unknown>;
  files: Record<string, ExcalidrawFile>;
};

const dataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });

function WhiteboardExportPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId, pageId, boardId } = params;
  const [scene, setScene] = useState<Scene | null>(null);
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const board = await whiteboardService.retrieve(workspaceSlug, projectId, pageId, boardId);
        const boardScene = (board.scene ?? {}) as {
          elements?: Record<string, unknown>[];
          appState?: Record<string, unknown>;
          files?: Record<string, ExcalidrawFile>;
        };
        const files: Record<string, ExcalidrawFile> = { ...boardScene.files };
        await Promise.all(
          board.asset_ids.map(async (assetId) => {
            try {
              const response = await fetch(getEditorAssetSrc({ assetId, projectId, workspaceSlug }) ?? "");
              const blob = await response.blob();
              files[assetId] = { id: assetId, dataURL: await dataUrl(blob), mimeType: blob.type, created: Date.now() };
            } catch {
              /* A missing image renders as a broken placeholder inside the exported screenshot. */
            }
          })
        );
        if (cancelled) return;
        const elements = (boardScene.elements ?? []).filter((element) => !element?.isDeleted);
        setScene({ elements, appState: boardScene.appState ?? {}, files });
      } catch {
        if (!cancelled) window.__EXPORT_ERROR__ = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, projectId, pageId, boardId]);

  useEffect(() => {
    if (!excalidrawAPI || !scene) return;
    excalidrawAPI.scrollToContent(scene.elements as never, { fitToViewport: true, animate: false });
    // Two rAFs: the first commits Excalidraw's re-render from scrollToContent,
    // the second guarantees the canvas has actually painted before the
    // watching headless browser is told it's safe to screenshot.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.__EXPORT_READY__ = true;
      })
    );
  }, [excalidrawAPI, scene]);

  if (!scene) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#ffffff" }}>
      {/* Hides Excalidraw's editing chrome (toolbar, menus, zoom controls) so the
          screenshot captures only the drawn content, not the read-only viewer UI. */}
      <style>{`
        .excalidraw .App-toolbar-container,
        .excalidraw .layer-ui__wrapper__top-right,
        .excalidraw .footer-center,
        .excalidraw .layer-ui__wrapper__footer-left,
        .excalidraw .disable-zen-mode,
        .excalidraw .scroll-back-to-content { display: none !important; }
      `}</style>
      <Excalidraw
        initialData={{ elements: scene.elements as never, appState: scene.appState, files: scene.files as never }}
        excalidrawAPI={setExcalidrawAPI}
        viewModeEnabled
        zenModeEnabled
      />
    </div>
  );
}

export default WhiteboardExportPage;
