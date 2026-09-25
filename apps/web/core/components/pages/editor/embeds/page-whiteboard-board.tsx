/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Circle,
  CornerDownRight,
  Diamond,
  Hand,
  ImagePlus,
  MousePointer2,
  MoveUpRight,
  Network,
  RectangleHorizontal,
  Square,
  Triangle,
  Type,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EFileAssetType } from "@plane/types";
import { cn, getEditorAssetSrc } from "@plane/utils";
import {
  WHITEBOARD_IMAGE_TYPES,
  WhiteboardCanvas,
  createEmptyScene,
  insertWhiteboardImages,
  isWhiteboardScene,
  setWhiteboardTool,
} from "@plane/whiteboard";
import type {
  PlaitBoard,
  WhiteboardImageError,
  WhiteboardImages,
  WhiteboardScene,
  WhiteboardTool,
} from "@plane/whiteboard";

import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useFileSize } from "@/hooks/use-file-size";

/**
 * Everything that needs Plait lives here, so `page-whiteboard-embed.tsx` can load this file lazily:
 * a page without a whiteboard never downloads the drawing engine.
 */

type TToolButton = { tool: WhiteboardTool; labelKey: string; icon: LucideIcon };

// Navigation tools first, then everything that places something on the board.
const NAVIGATION_TOOLS: TToolButton[] = [
  { tool: "select", labelKey: "page_whiteboard.tools.select", icon: MousePointer2 },
  { tool: "hand", labelKey: "page_whiteboard.tools.hand", icon: Hand },
];

const CREATION_TOOLS: TToolButton[] = [
  { tool: "mind", labelKey: "page_whiteboard.tools.mind", icon: Network },
  { tool: "text", labelKey: "page_whiteboard.tools.text", icon: Type },
  { tool: "rectangle", labelKey: "page_whiteboard.tools.rectangle", icon: Square },
  { tool: "roundRectangle", labelKey: "page_whiteboard.tools.round_rectangle", icon: RectangleHorizontal },
  { tool: "ellipse", labelKey: "page_whiteboard.tools.ellipse", icon: Circle },
  { tool: "diamond", labelKey: "page_whiteboard.tools.diamond", icon: Diamond },
  { tool: "triangle", labelKey: "page_whiteboard.tools.triangle", icon: Triangle },
  { tool: "arrow", labelKey: "page_whiteboard.tools.arrow", icon: MoveUpRight },
  { tool: "elbowArrow", labelKey: "page_whiteboard.tools.elbow_arrow", icon: CornerDownRight },
];

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTool, setActiveTool] = useState<WhiteboardTool>("select");
  const [uploadingCount, setUploadingCount] = useState(0);
  const [initialScene] = useState(() => toInitialScene(scene));

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

  const pickTool = (tool: WhiteboardTool) => {
    const board = boardRef.current;
    if (!board) return;
    setWhiteboardTool(board, tool);
    setActiveTool(tool);
  };

  const handleFilesPicked = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Reset so that picking the same file again still fires `change`.
    event.target.value = "";
    const board = boardRef.current;
    if (board && files.length > 0) void insertWhiteboardImages(board, files);
  };

  const renderTool = ({ tool, labelKey, icon: Icon }: TToolButton) => {
    const label = t(labelKey);
    const active = activeTool === tool;
    return (
      <button
        key={tool}
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-sm",
          active ? "bg-accent-subtle text-accent-primary" : "text-secondary hover:bg-layer-transparent-hover"
        )}
        onClick={() => pickTool(tool)}
      >
        <Icon className="size-4" />
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {!readOnly && (
        <div
          role="toolbar"
          aria-label={t("page_whiteboard.toolbar")}
          className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-subtle px-2 py-1"
        >
          {NAVIGATION_TOOLS.map(renderTool)}
          <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-layer-3" />
          {CREATION_TOOLS.map(renderTool)}
          {canAddImages && (
            <>
              <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-layer-3" />
              <button
                type="button"
                title={t("page_whiteboard.tools.image")}
                aria-label={t("page_whiteboard.tools.image")}
                className="grid size-7 shrink-0 place-items-center rounded-sm text-secondary hover:bg-layer-transparent-hover"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="size-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                multiple
                accept={WHITEBOARD_IMAGE_TYPES.join(",")}
                onChange={handleFilesPicked}
              />
            </>
          )}
          {uploadingCount > 0 && (
            <span role="status" className="text-xs ml-2 shrink-0 text-tertiary">
              {t("page_whiteboard.image.uploading")}
            </span>
          )}
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <WhiteboardCanvas
          initialScene={initialScene}
          readOnly={readOnly}
          labels={labels}
          images={images}
          onSceneChange={onSceneChange}
          onToolChange={setActiveTool}
          onReady={(board) => {
            boardRef.current = board;
          }}
        />
      </div>
    </div>
  );
}
