/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Maximize2, PenTool, X } from "lucide-react";
import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";
// eslint-disable-next-line import/no-unassigned-import -- stylesheet import, nothing to bind
import "@excalidraw/excalidraw/index.css";
import { EFileAssetType } from "@plane/types";
import { getEditorAssetSrc } from "@plane/utils";

import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { PageWhiteboardService, type TPageWhiteboard } from "@/services/page";

const whiteboardService = new PageWhiteboardService();

type Props = {
  boardId: string;
  pageId?: string;
  currentPageId?: string;
  projectId?: string;
  workspaceSlug?: string;
  readOnly?: boolean;
};
// appState is `any` because Excalidraw's real AppState type has no index
// signature and we only ever pass it through opaquely, never read a key off it.
type Scene = { elements?: any[]; appState?: any; files?: Record<string, any> };

// Excalidraw needs dataURL while its canvas is open, but the asset bytes are
// already durable in MinIO (BOARD-08/D13). Use Excalidraw's own "database"
// serialization mode instead of hand-filtering: it drops `files` entirely
// (no base64 leaves this function) and also drops soft-deleted elements and
// UI-only appState via clearElementsForDatabase/clearAppStateForDatabase, so
// the scene doesn't grow unbounded from an editing session's undo history.
const sceneForStorage = (scene: Scene): Scene => {
  const cleaned = JSON.parse(
    serializeAsJSON(scene.elements ?? [], scene.appState ?? {}, scene.files ?? {}, "database")
  );
  return { elements: cleaned.elements, appState: cleaned.appState };
};

const dataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });

export function PageWhiteboardEmbed({
  boardId,
  pageId,
  currentPageId,
  projectId,
  workspaceSlug,
  readOnly = false,
}: Props) {
  const [board, setBoard] = useState<TPageWhiteboard | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sceneRef = useRef<Scene>({ elements: [] });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apiRef = useRef<any>(null);
  const { uploadEditorAsset } = useEditorAsset();

  const load = useCallback(async () => {
    if (!boardId || !pageId || !projectId || !workspaceSlug) return;
    try {
      const fetchedBoard = await whiteboardService.retrieve(workspaceSlug, projectId, pageId, boardId);
      const scene = (fetchedBoard.scene ?? {}) as Scene;
      const files: Record<string, any> = { ...scene.files };
      await Promise.all(
        fetchedBoard.asset_ids.map(async (assetId) => {
          try {
            const assetResponse = await fetch(getEditorAssetSrc({ assetId, projectId, workspaceSlug }) ?? "");
            const blob = await assetResponse.blob();
            files[assetId] = { id: assetId, dataURL: await dataUrl(blob), mimeType: blob.type, created: Date.now() };
          } catch {
            /* A missing image stays visibly unavailable without invalidating the board. */
          }
        })
      );
      sceneRef.current = { ...scene, files };
      setBoard({ ...fetchedBoard, scene: sceneRef.current });
    } catch {
      setError("Could not load this whiteboard.");
    }
  }, [boardId, pageId, projectId, workspaceSlug]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    []
  );

  const save = useCallback(
    (scene: Scene) => {
      if (!board || !pageId || !projectId || !workspaceSlug || readOnly) return;
      sceneRef.current = scene;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          // asset_ids must come from the RAW files map (what's actually referenced
          // by this save), not from storedScene — sceneForStorage intentionally
          // drops `files` entirely, so reading it back off the stripped scene
          // would silently persist zero assets.
          const next = await whiteboardService.update(workspaceSlug, projectId, pageId, board.id, {
            scene: sceneForStorage(scene),
            asset_ids: Object.keys(scene.files ?? {}),
            expected_revision: board.revision,
          });
          setBoard(next);
        } catch (response: any) {
          setError(response?.detail ?? "This board changed elsewhere. Reload it before saving again.");
        }
      }, 700);
    },
    [board, pageId, projectId, readOnly, workspaceSlug]
  );

  const addImage = async (file?: File) => {
    if (!file || !pageId || !projectId || !workspaceSlug || readOnly) return;
    try {
      const { asset_id } = await uploadEditorAsset({
        blockId: `whiteboard-${boardId}`,
        file,
        workspaceSlug,
        projectId,
        data: { entity_identifier: pageId, entity_type: EFileAssetType.PAGE_DESCRIPTION },
      });
      const image = await dataUrl(file);
      const api = apiRef.current;
      const elements = api?.getSceneElements?.() ?? sceneRef.current.elements ?? [];
      const element = {
        id: crypto.randomUUID(),
        type: "image",
        fileId: asset_id,
        x: 100,
        y: 100,
        width: 240,
        height: 160,
        angle: 0,
        strokeColor: "transparent",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed: Math.floor(Math.random() * 100000),
        version: 1,
        versionNonce: Math.floor(Math.random() * 100000),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
        status: "saved",
        crop: null,
      };
      api?.addFiles?.([{ id: asset_id, dataURL: image, mimeType: file.type, created: Date.now() }]);
      api?.updateScene?.({ elements: [...elements, element] });
    } catch {
      setError("Image upload failed. Please try again.");
    }
  };

  if (currentPageId && pageId && currentPageId !== pageId) {
    return (
      <div className="border-warning text-sm my-2 rounded border bg-warning-subtle p-3">
        This whiteboard belongs to another Page and cannot be copied here.
      </div>
    );
  }
  if (error && !board)
    return <div className="border-danger text-sm my-2 rounded border bg-danger-subtle p-3">{error}</div>;
  return (
    <div className="my-2 rounded border border-subtle bg-layer-1 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm flex items-center gap-2 font-medium">
          <PenTool className="size-4" /> Whiteboard
        </span>
        <button type="button" className="text-sm text-accent flex items-center gap-1" onClick={() => setOpen(true)}>
          <Maximize2 className="size-4" /> Open canvas
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-6">
          <div className="shadow-xl flex h-[min(82vh,760px)] w-[min(96vw,1200px)] flex-col overflow-hidden rounded-lg bg-layer-1">
            <div className="flex items-center justify-between border-b border-subtle px-4 py-3">
              <span className="font-medium">Whiteboard</span>
              <div className="flex items-center gap-3">
                {!readOnly && (
                  <label className="text-sm text-accent cursor-pointer">
                    <ImagePlus className="mr-1 inline size-4" /> Add image
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void addImage(e.target.files?.[0])}
                    />
                  </label>
                )}
                <button type="button" onClick={() => setOpen(false)}>
                  <X className="size-5" />
                </button>
              </div>
            </div>
            {error && <div className="border-danger text-sm border-b bg-danger-subtle px-4 py-2">{error}</div>}
            <div className="min-h-0 flex-1">
              <Excalidraw
                key={board?.revision ?? "loading"}
                initialData={board?.scene as any}
                excalidrawAPI={(api) => {
                  apiRef.current = api;
                }}
                viewModeEnabled={readOnly}
                onChange={(elements, appState, files) => save({ elements: [...elements], appState, files })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
