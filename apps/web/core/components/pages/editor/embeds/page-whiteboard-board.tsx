/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { PAGE_COMMENT_REQUEST_EVENT } from "@plane/editor";
import type { TPageCommentAnchorEventDetail } from "@plane/editor";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EFileAssetType } from "@plane/types";
import { getEditorAssetSrc } from "@plane/utils";
import {
  EMPTY_WHITEBOARD_SELECTION,
  WhiteboardCanvas,
  canRedoWhiteboard,
  canUndoWhiteboard,
  createEmptyScene,
  fitWhiteboard,
  getSingleSelectedWhiteboardElementId,
  getWhiteboardZoom,
  hasWhiteboardElement,
  insertWhiteboardImages,
  isWhiteboardScene,
  readWhiteboardSelection,
  redoWhiteboard,
  resetWhiteboardZoom,
  selectWhiteboardElement,
  setWhiteboardTool,
  undoWhiteboard,
  whiteboardSelectionEquals,
  zoomWhiteboard,
} from "@plane/whiteboard";
import type {
  PlaitBoard,
  WhiteboardImageError,
  WhiteboardImages,
  WhiteboardScene,
  WhiteboardSelection,
  WhiteboardTool,
} from "@plane/whiteboard";

import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useFileSize } from "@/hooks/use-file-size";
import {
  notifyCommentBoardsChanged,
  registerCommentBoard,
  useBoardComments,
} from "@/components/pages/comments/board-comments";
import { WhiteboardCommentBadges } from "./whiteboard-comment-badges";
import { WhiteboardPropertyBar } from "./whiteboard-property-bar";
import { WhiteboardToolbar } from "./whiteboard-toolbar";

/**
 * Everything that needs Plait lives here, so `page-whiteboard-embed.tsx` can load this file lazily:
 * a page without a whiteboard never downloads the drawing engine.
 */

// A board created empty stores `{}`-like data; anything else that is not a v2 scene is not ours to overwrite.
const toInitialScene = (scene: Record<string, unknown>): WhiteboardScene | null => {
  if (isWhiteboardScene(scene)) return scene;
  return Object.keys(scene).length === 0 ? createEmptyScene() : null;
};

const IMAGE_ERROR_KEYS: Record<WhiteboardImageError, string> = {
  unsupported: "page_whiteboard.image.unsupported",
  too_large: "page_whiteboard.image.too_large",
  upload_failed: "page_whiteboard.image.upload_failed",
};

type Props = {
  /** Comments on the whiteboard's elements are stored against this ID. */
  boardId: string;
  /** The stored scene. It is read once; the canvas owns the live state afterwards. */
  scene: Record<string, unknown>;
  readOnly: boolean;
  workspaceSlug?: string;
  projectId?: string;
  /** The page the board belongs to; uploaded images become assets of this page. */
  pageId?: string;
  /** Called with the ID of every image uploaded here, so the next save may list it in `asset_ids`. */
  noteAsset: (assetId: string) => void;
  onSceneChange: (scene: WhiteboardScene) => void;
};

export default function PageWhiteboardBoard({
  boardId,
  scene,
  readOnly,
  workspaceSlug,
  projectId,
  pageId,
  noteAsset,
  onSceneChange,
}: Props) {
  const { t } = useTranslation();
  const { uploadEditorAsset } = useEditorAsset();
  const { maxFileSize } = useFileSize();
  const boardRef = useRef<PlaitBoard | null>(null);
  const [readyBoard, setReadyBoard] = useState<PlaitBoard | null>(null);
  const [activeTool, setActiveTool] = useState<WhiteboardTool>("select");
  const [uploadingCount, setUploadingCount] = useState(0);
  const [selection, setSelection] = useState<WhiteboardSelection>(EMPTY_WHITEBOARD_SELECTION);
  const [view, setView] = useState({ zoom: 1, canUndo: false, canRedo: false });
  const [initialScene] = useState(() => toInitialScene(scene));
  const rootRef = useRef<HTMLDivElement>(null);
  const [, setFrame] = useState(0);
  const frameRef = useRef<number | null>(null);
  const { enabled: commentsEnabled, counts: commentCounts } = useBoardComments(pageId, boardId);
  const hasBadgesRef = useRef(false);
  hasBadgesRef.current = commentsEnabled && Object.keys(commentCounts).length > 0;

  // Badges sit on elements, so they are drawn again after the board changes; one render per frame at most.
  const scheduleBadgeFrame = useCallback(() => {
    if (!hasBadgesRef.current || frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setFrame((value) => value + 1);
    });
  }, []);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    []
  );

  useEffect(() => {
    if (!readyBoard) return;
    return registerCommentBoard(boardId, {
      hasElement: (elementId) => hasWhiteboardElement(readyBoard, elementId),
      locateElement: (elementId) => {
        if (!selectWhiteboardElement(readyBoard, elementId)) return false;
        rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        setSelection(readWhiteboardSelection(readyBoard));
        return true;
      },
    });
  }, [boardId, readyBoard]);

  const commentOnSelection = () => {
    const board = boardRef.current;
    const elementId = board && getSingleSelectedWhiteboardElementId(board);
    if (!elementId) return;
    window.dispatchEvent(
      new CustomEvent<TPageCommentAnchorEventDetail>(PAGE_COMMENT_REQUEST_EVENT, {
        detail: { anchorType: "board_element", anchorId: elementId, anchorBoardId: boardId },
      })
    );
  };

  const uploadImage = useCallback(
    async (file: File) => {
      if (!workspaceSlug || !projectId || !pageId) throw new Error("Missing page context");
      setUploadingCount((count) => count + 1);
      try {
        const { asset_id } = await uploadEditorAsset({
          // `crypto.randomUUID` is missing on a self-hosted instance served over plain HTTP.
          blockId: uuidv4(),
          data: { entity_identifier: pageId, entity_type: EFileAssetType.PAGE_DESCRIPTION },
          file,
          projectId,
          workspaceSlug,
        });
        noteAsset(asset_id);
        return asset_id;
      } finally {
        setUploadingCount((count) => count - 1);
      }
    },
    [noteAsset, pageId, projectId, uploadEditorAsset, workspaceSlug]
  );

  // Images are stored as asset IDs and turned into a URL only when drawn.
  const images = useMemo<WhiteboardImages | undefined>(() => {
    if (!workspaceSlug || !projectId) return undefined;
    return {
      resolveUrl: (assetId) => getEditorAssetSrc({ assetId, projectId, workspaceSlug }),
      upload: pageId ? uploadImage : undefined,
      maxFileSize,
      onError: (kind) => {
        setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t(IMAGE_ERROR_KEYS[kind]) });
      },
    };
  }, [maxFileSize, pageId, projectId, t, uploadImage, workspaceSlug]);
  const canAddImages = !readOnly && !!images?.upload;

  const labels = useMemo(
    () => ({
      text: t("page_whiteboard.labels.text"),
      lineText: t("page_whiteboard.labels.line_text"),
      mindCentral: t("page_whiteboard.labels.mind_central"),
      mindSummary: t("page_whiteboard.labels.mind_summary"),
    }),
    [t]
  );

  if (!initialScene) {
    return (
      <div className="text-sm flex h-full items-center justify-center px-4 text-center text-danger-primary">
        {t("page_whiteboard.load_error")}
      </div>
    );
  }

  // Runs after every Plait change; each snapshot is compared first so an unchanged one causes no render.
  const syncSnapshots = useCallback(
    (board: PlaitBoard) => {
      const next = readWhiteboardSelection(board);
      setSelection((current) => (whiteboardSelectionEquals(current, next) ? current : next));
      scheduleBadgeFrame();
      const zoom = getWhiteboardZoom(board);
      const canUndo = canUndoWhiteboard(board);
      const canRedo = canRedoWhiteboard(board);
      setView((current) =>
        current.zoom === zoom && current.canUndo === canUndo && current.canRedo === canRedo
          ? current
          : { zoom, canUndo, canRedo }
      );
    },
    [scheduleBadgeFrame]
  );

  const withBoard = (action: (board: PlaitBoard) => void) => () => {
    const board = boardRef.current;
    if (!board) return;
    action(board);
    syncSnapshots(board);
  };

  const pickTool = (tool: WhiteboardTool) => {
    const board = boardRef.current;
    if (!board) return;
    setWhiteboardTool(board, tool);
    setActiveTool(tool);
  };

  const pickImages = (files: File[]) => {
    const board = boardRef.current;
    if (board) void insertWhiteboardImages(board, files);
  };

  return (
    <div ref={rootRef} className="flex h-full flex-col">
      {!readOnly && (
        <WhiteboardToolbar
          activeTool={activeTool}
          zoom={view.zoom}
          canUndo={view.canUndo}
          canRedo={view.canRedo}
          canAddImages={canAddImages}
          uploading={uploadingCount > 0}
          onPickTool={pickTool}
          onUndo={withBoard(undoWhiteboard)}
          onRedo={withBoard(redoWhiteboard)}
          onZoomIn={withBoard((b) => zoomWhiteboard(b, "in"))}
          onZoomOut={withBoard((b) => zoomWhiteboard(b, "out"))}
          onZoomReset={withBoard(resetWhiteboardZoom)}
          onFit={withBoard(fitWhiteboard)}
          onPickImages={pickImages}
        />
      )}
      <div className="relative min-h-0 flex-1">
        {!readOnly && readyBoard && (
          <div className="pointer-events-none absolute inset-x-2 top-2 z-10">
            <WhiteboardPropertyBar
              board={readyBoard}
              selection={selection}
              onComment={commentsEnabled ? commentOnSelection : undefined}
            />
          </div>
        )}
        {commentsEnabled && readyBoard && (
          <WhiteboardCommentBadges board={readyBoard} boardId={boardId} counts={commentCounts} />
        )}
        <WhiteboardCanvas
          initialScene={initialScene}
          readOnly={readOnly}
          labels={labels}
          images={images}
          onSceneChange={(next) => {
            onSceneChange(next);
            notifyCommentBoardsChanged();
          }}
          onChange={syncSnapshots}
          onToolChange={setActiveTool}
          onReady={(board) => {
            boardRef.current = board;
            setReadyBoard(board);
            syncSnapshots(board);
          }}
        />
      </div>
    </div>
  );
}
