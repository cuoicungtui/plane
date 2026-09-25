/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { GripHorizontal, Maximize2, Minimize2, PenTool } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";

import { PageWhiteboardService, type TPageWhiteboard } from "@/services/page";
import { useWhiteboardAutosave } from "./use-whiteboard-autosave";

const whiteboardService = new PageWhiteboardService();

// The drawing engine is large; it is fetched only when a page actually contains a whiteboard.
const PageWhiteboardBoard = lazy(() => import("./page-whiteboard-board"));

type Props = {
  boardId: string;
  pageId?: string;
  currentPageId?: string;
  projectId?: string;
  workspaceSlug?: string;
  readOnly?: boolean;
  height?: number;
  onHeightChange?: (height: number) => void;
};

const DEFAULT_HEIGHT = 420;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 1200;

export function PageWhiteboardEmbed({
  boardId,
  pageId,
  currentPageId,
  projectId,
  workspaceSlug,
  readOnly = false,
  height,
  onHeightChange,
}: Props) {
  const { t } = useTranslation();
  const [board, setBoard] = useState<TPageWhiteboard | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Bumped to fetch the board again (after an edit conflict); the canvas remounts with the new content.
  const [loadCount, setLoadCount] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [canvasHeight, setCanvasHeight] = useState(height ?? DEFAULT_HEIGHT);
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const belongsToAnotherPage = !!currentPageId && !!pageId && currentPageId !== pageId;
  const { saveState, schedule, reset, noteAsset } = useWhiteboardAutosave({
    workspaceSlug,
    projectId,
    pageId,
    boardId,
    enabled: !readOnly,
  });

  useEffect(() => {
    if (height !== undefined) setCanvasHeight(height);
  }, [height]);

  useEffect(() => {
    if (belongsToAnotherPage || !boardId || !pageId || !projectId || !workspaceSlug) return;
    let cancelled = false;
    setLoadFailed(false);
    void (async () => {
      try {
        const fetched = await whiteboardService.retrieve(workspaceSlug, projectId, pageId, boardId);
        if (cancelled) return;
        reset(fetched.revision, fetched.asset_ids);
        setBoard(fetched);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [belongsToAnotherPage, boardId, pageId, projectId, workspaceSlug, loadCount, reset]);

  const reload = useCallback(() => {
    setBoard(null);
    setLoadCount((count) => count + 1);
  }, []);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startY: e.clientY, startHeight: canvasHeight };
    const handleMove = (moveEvent: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = moveEvent.clientY - resizeRef.current.startY;
      const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, resizeRef.current.startHeight + delta));
      setCanvasHeight(next);
    };
    const handleUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      setCanvasHeight((current) => {
        onHeightChange?.(current);
        return current;
      });
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  if (belongsToAnotherPage) {
    return (
      <div className="text-sm my-2 rounded border border-subtle bg-warning-subtle p-3 text-warning-primary">
        {t("page_whiteboard.belongs_to_other_page")}
      </div>
    );
  }
  if (loadFailed && !board) {
    return (
      <div className="text-sm my-2 rounded border border-danger-subtle bg-danger-subtle p-3 text-danger-primary">
        {t("page_whiteboard.load_error")}
      </div>
    );
  }
  // Boards made with the previous drawing tool (Excalidraw) are kept in the database but cannot be shown.
  if (board && board.engine !== "plait") {
    return (
      <div className="text-sm my-2 rounded border border-subtle bg-layer-1 p-3 text-tertiary">
        {t("page_whiteboard.unsupported_engine")}
      </div>
    );
  }

  const loading = (
    <div className="text-sm flex h-full items-center justify-center text-tertiary">{t("page_whiteboard.loading")}</div>
  );

  const statusLabel =
    saveState === "saving" ? t("page_whiteboard.saving") : saveState === "saved" ? t("page_whiteboard.saved") : null;

  return (
    <div
      className={cn(
        "my-2 flex flex-col overflow-hidden rounded border border-subtle bg-layer-1",
        fullscreen && "shadow-xl fixed inset-6 z-[120]"
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-subtle px-3 py-2">
        <span className="text-sm flex items-center gap-2 font-medium">
          <PenTool className="size-4" /> {t("page_whiteboard.title")}
        </span>
        <div className="flex items-center gap-3">
          {statusLabel && <span className="text-xs text-tertiary">{statusLabel}</span>}
          <button
            type="button"
            className="text-tertiary hover:text-primary"
            title={fullscreen ? t("page_whiteboard.exit_fullscreen") : t("page_whiteboard.fullscreen")}
            aria-label={fullscreen ? t("page_whiteboard.exit_fullscreen") : t("page_whiteboard.fullscreen")}
            onClick={() => setFullscreen((value) => !value)}
          >
            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        </div>
      </div>
      {saveState === "error" && (
        <div className="text-sm border-b border-danger-subtle bg-danger-subtle px-3 py-2 text-danger-primary">
          {t("page_whiteboard.save_error")}
        </div>
      )}
      {saveState === "conflict" && (
        <div className="text-sm flex items-center justify-between gap-3 border-b border-danger-subtle bg-danger-subtle px-3 py-2 text-danger-primary">
          <span>{t("page_whiteboard.conflict_error")}</span>
          <button type="button" className="font-medium underline" onClick={reload}>
            {t("page_whiteboard.reload")}
          </button>
        </div>
      )}
      <div
        contentEditable={false}
        // flex-1 (flex-basis: 0%) only resolves against a parent with a definite
        // height, which fullscreen has (`inset-6`) and the default inline layout
        // doesn't — there the explicit height below must drive sizing instead,
        // or flex-grow has no free space to distribute and this collapses to 0.
        className={cn("relative min-h-0", fullscreen && "flex-1")}
        style={{ height: fullscreen ? undefined : canvasHeight }}
      >
        {board ? (
          <Suspense fallback={loading}>
            <PageWhiteboardBoard
              // Keyed by board id and load, not revision: the revision bumps on every autosave and would
              // remount (and visibly flicker) the canvas after each edit.
              key={`${board.id}:${loadCount}`}
              boardId={boardId}
              scene={board.scene}
              readOnly={readOnly}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              pageId={pageId}
              noteAsset={noteAsset}
              onSceneChange={schedule}
            />
          </Suspense>
        ) : (
          loading
        )}
      </div>
      {!fullscreen && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={t("page_whiteboard.resize")}
          onMouseDown={handleResizeStart}
          className="flex h-3 shrink-0 cursor-row-resize items-center justify-center border-t border-subtle bg-layer-2 hover:bg-layer-3"
        >
          <GripHorizontal className="size-3 text-tertiary" />
        </div>
      )}
    </div>
  );
}
