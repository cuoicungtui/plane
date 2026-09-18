/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Maximize2, PenTool, X } from "lucide-react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { EFileAssetType } from "@plane/types";
import { getEditorAssetSrc } from "@plane/utils";

import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { PageWhiteboardService, type TPageWhiteboard } from "@/services/page";

const whiteboardService = new PageWhiteboardService();

type Props = { boardId: string; pageId?: string; currentPageId?: string; projectId?: string; workspaceSlug?: string; readOnly?: boolean };
type Scene = { elements?: any[]; appState?: Record<string, unknown>; files?: Record<string, any> };

const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

export function PageWhiteboardEmbed({ boardId, pageId, currentPageId, projectId, workspaceSlug, readOnly = false }: Props) {
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
      const response = await whiteboardService.retrieve(workspaceSlug, projectId, pageId, boardId);
      const scene = (response.scene ?? {}) as Scene;
      const files: Record<string, any> = { ...(scene.files ?? {}) };
      await Promise.all(response.asset_ids.map(async (assetId) => {
        try {
          const response = await fetch(getEditorAssetSrc({ assetId, projectId, workspaceSlug }) ?? "");
          const blob = await response.blob();
          files[assetId] = { id: assetId, dataURL: await dataUrl(blob), mimeType: blob.type, created: Date.now() };
        } catch { /* A missing image stays visibly unavailable without invalidating the board. */ }
      }));
      sceneRef.current = { ...scene, files };
      setBoard({ ...response, scene: sceneRef.current });
    } catch {
      setError("Could not load this whiteboard.");
    }
  }, [boardId, pageId, projectId, workspaceSlug]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const save = useCallback((scene: Scene) => {
    if (!board || !pageId || !projectId || !workspaceSlug || readOnly) return;
    sceneRef.current = scene;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const next = await whiteboardService.update(workspaceSlug, projectId, pageId, board.id, {
          scene, asset_ids: Object.keys(scene.files ?? {}), expected_revision: board.revision,
        });
        setBoard(next);
      } catch (response: any) {
        setError(response?.detail ?? "This board changed elsewhere. Reload it before saving again.");
      }
    }, 700);
  }, [board, pageId, projectId, readOnly, workspaceSlug]);

  const addImage = async (file?: File) => {
    if (!file || !pageId || !projectId || !workspaceSlug || readOnly) return;
    try {
      const { asset_id } = await uploadEditorAsset({
        blockId: `whiteboard-${boardId}`, file, workspaceSlug, projectId,
        data: { entity_identifier: pageId, entity_type: EFileAssetType.PAGE_DESCRIPTION },
      });
      const image = await dataUrl(file);
      const api = apiRef.current;
      const elements = api?.getSceneElements?.() ?? sceneRef.current.elements ?? [];
      const element = { id: crypto.randomUUID(), type: "image", fileId: asset_id, x: 100, y: 100, width: 240, height: 160,
        angle: 0, strokeColor: "transparent", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 1,
        strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: [], frameId: null, roundness: null,
        seed: Math.floor(Math.random() * 100000), version: 1, versionNonce: Math.floor(Math.random() * 100000), isDeleted: false,
        boundElements: null, updated: Date.now(), link: null, locked: false, status: "saved", crop: null };
      api?.addFiles?.([{ id: asset_id, dataURL: image, mimeType: file.type, created: Date.now() }]);
      api?.updateScene?.({ elements: [...elements, element] });
    } catch { setError("Image upload failed. Please try again."); }
  };

  if (currentPageId && pageId && currentPageId !== pageId) {
    return <div className="my-2 rounded border border-warning bg-warning-subtle p-3 text-sm">This whiteboard belongs to another Page and cannot be copied here.</div>;
  }
  if (error && !board) return <div className="my-2 rounded border border-danger bg-danger-subtle p-3 text-sm">{error}</div>;
  return <div className="my-2 rounded border border-subtle bg-layer-1 p-3">
    <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-medium"><PenTool className="size-4" /> Whiteboard</span>
      <button type="button" className="flex items-center gap-1 text-sm text-accent" onClick={() => setOpen(true)}><Maximize2 className="size-4" /> Open canvas</button></div>
    {open && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-6"><div className="flex h-[min(82vh,760px)] w-[min(96vw,1200px)] flex-col overflow-hidden rounded-lg bg-layer-1 shadow-xl">
      <div className="flex items-center justify-between border-b border-subtle px-4 py-3"><span className="font-medium">Whiteboard</span><div className="flex items-center gap-3">{!readOnly && <label className="cursor-pointer text-sm text-accent"><ImagePlus className="mr-1 inline size-4" /> Add image<input type="file" accept="image/*" className="hidden" onChange={(e) => void addImage(e.target.files?.[0])} /></label>}<button type="button" onClick={() => setOpen(false)}><X className="size-5" /></button></div></div>
      {error && <div className="border-b border-danger bg-danger-subtle px-4 py-2 text-sm">{error}</div>}
      <div className="min-h-0 flex-1"><Excalidraw key={board?.revision ?? "loading"} initialData={board?.scene as any} excalidrawAPI={(api) => { apiRef.current = api; }} viewModeEnabled={readOnly} onChange={(elements: any[], appState: any, files: any) => save({ elements, appState, files })} /></div>
    </div></div>}
  </div>;
}
