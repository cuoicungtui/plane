/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GripHorizontal, ImagePlus, Maximize2, Minimize2, PenTool } from "lucide-react";
import { Excalidraw, serializeAsJSON, useHandleLibrary } from "@excalidraw/excalidraw";
import type { BinaryFileData, DataURL, ExcalidrawImperativeAPI, LibraryItems } from "@excalidraw/excalidraw/types";
import type { FileId } from "@excalidraw/excalidraw/element/types";
// eslint-disable-next-line import/no-unassigned-import -- stylesheet import, nothing to bind
import "@excalidraw/excalidraw/index.css";
import { EFileAssetType } from "@plane/types";
import { cn, getEditorAssetSrc } from "@plane/utils";

import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { PageWhiteboardService, type TPageWhiteboard } from "@/services/page";
import { workspaceWhiteboardLibraryService } from "@/services/workspace/workspace-whiteboard-library.service";

const whiteboardService = new PageWhiteboardService();

// The Excalidraw "Library" (shapes/icons someone collects from
// libraries.excalidraw.com) is shared across the whole workspace: every
// member sees the same items on every board. localStorage is kept only as
// an instant-paint cache so the panel isn't empty while the workspace's
// copy loads from the server.
const LIBRARY_STORAGE_KEY = "plane-whiteboard-library-items";

const loadStoredLibraryItems = (): LibraryItems => {
  try {
    const raw = localStorage.getItem(LIBRARY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LibraryItems) : [];
  } catch {
    return [];
  }
};

const storeLibraryItems = (items: LibraryItems) => {
  try {
    localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* Private browsing / blocked storage — the cache just won't persist. */
  }
};

// A late-resolving server fetch must not clobber items the user added to the
// canvas while it was in flight — union by id, letting local win on overlap
// since it's the more recent write.
const mergeLibraryItemsById = (serverItems: LibraryItems, localItems: LibraryItems): LibraryItems => {
  const merged = new Map<string, LibraryItems[number]>();
  serverItems.forEach((item) => merged.set(item.id, item));
  localItems.forEach((item) => merged.set(item.id, item));
  return Array.from(merged.values());
};

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
// appState is `any` because Excalidraw's real AppState type has no index
// signature and we only ever pass it through opaquely, never read a key off it.
type Scene = { elements?: any[]; appState?: any; files?: Record<string, any> };

const DEFAULT_HEIGHT = 420;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 1200;

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
  height,
  onHeightChange,
}: Props) {
  const [board, setBoard] = useState<TPageWhiteboard | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [canvasHeight, setCanvasHeight] = useState(height ?? DEFAULT_HEIGHT);
  const sceneRef = useRef<Scene>({ elements: [] });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const { uploadEditorAsset } = useEditorAsset();

  // Real Excalidraw's own "Add to Excalidraw" flow from libraries.excalidraw.com
  // works by messaging back the window that opened it — this hook is what
  // listens for that message and imports the chosen library into the canvas.
  useHandleLibrary({ excalidrawAPI });
  const initialLibraryItems = useMemo(loadStoredLibraryItems, []);
  const libraryItemsRef = useRef<LibraryItems>(initialLibraryItems);
  const librarySaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Excalidraw fires onLibraryChange for its own programmatic library
  // hydration too — both from `initialData.libraryItems` at mount and from
  // our updateLibrary() call once the server fetch resolves — exactly like it
  // would for a real user edit. Tracking what we last applied ourselves (and
  // skipping the save when the callback reports the same set back) avoids
  // relying on how many times, or in what order, Excalidraw happens to fire
  // that callback — a one-shot "ignore the next call" flag would be fragile
  // against that.
  const lastAppliedLibraryItemIds = useRef(new Set(initialLibraryItems.map((item) => item.id)));
  const [serverLibraryItems, setServerLibraryItems] = useState<LibraryItems | null>(null);
  const [libraryStatus, setLibraryStatus] = useState<"loading" | "synced" | "error">("loading");

  // Fetch the workspace's shared Library once; applying it to the canvas
  // happens in a separate effect below once excalidrawAPI is also ready,
  // since updateLibrary needs the imperative API, not initialData (which
  // only applies at Excalidraw's own mount time).
  useEffect(() => {
    if (!workspaceSlug) return;
    let cancelled = false;
    setLibraryStatus("loading");
    void (async () => {
      try {
        const library = await workspaceWhiteboardLibraryService.retrieve(workspaceSlug);
        if (cancelled) return;
        setServerLibraryItems((library.library_items ?? []) as LibraryItems);
      } catch {
        if (!cancelled) setLibraryStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug]);

  useEffect(() => {
    if (!excalidrawAPI || serverLibraryItems === null) return;
    const merged = mergeLibraryItemsById(serverLibraryItems, libraryItemsRef.current);
    libraryItemsRef.current = merged;
    storeLibraryItems(merged);
    lastAppliedLibraryItemIds.current = new Set(merged.map((item) => item.id));
    excalidrawAPI.updateLibrary({ libraryItems: merged, merge: false });
    setLibraryStatus("synced");
  }, [excalidrawAPI, serverLibraryItems]);

  const handleLibraryChange = useCallback(
    (items: LibraryItems) => {
      libraryItemsRef.current = items;
      storeLibraryItems(items);
      const incomingIds = new Set(items.map((item) => item.id));
      const isOwnProgrammaticUpdate =
        incomingIds.size === lastAppliedLibraryItemIds.current.size &&
        [...incomingIds].every((id) => lastAppliedLibraryItemIds.current.has(id));
      if (isOwnProgrammaticUpdate) return;
      lastAppliedLibraryItemIds.current = incomingIds;
      if (!workspaceSlug) return;
      if (librarySaveTimer.current) clearTimeout(librarySaveTimer.current);
      librarySaveTimer.current = setTimeout(async () => {
        try {
          await workspaceWhiteboardLibraryService.update(workspaceSlug, items as unknown[]);
          setLibraryStatus("synced");
        } catch {
          setLibraryStatus("error");
        }
      }, 700);
    },
    [workspaceSlug]
  );

  useEffect(() => {
    if (height !== undefined) setCanvasHeight(height);
  }, [height]);

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
      if (librarySaveTimer.current) clearTimeout(librarySaveTimer.current);
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
      const elements = excalidrawAPI?.getSceneElements?.() ?? sceneRef.current.elements ?? [];
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
      // asset_id/image are plain strings; Excalidraw brands FileId/DataURL as
      // nominal types purely to stop accidental mixups elsewhere in its own
      // code — there's no runtime validation, so a cast is the sanctioned way
      // to hand it values that come from outside its own APIs.
      const binaryFile: BinaryFileData = {
        id: asset_id as unknown as FileId,
        dataURL: image as unknown as DataURL,
        mimeType: file.type as BinaryFileData["mimeType"],
        created: Date.now(),
      };
      excalidrawAPI?.addFiles?.([binaryFile]);
      excalidrawAPI?.updateScene?.({ elements: [...elements, element] });
    } catch {
      setError("Image upload failed. Please try again.");
    }
  };

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

  if (currentPageId && pageId && currentPageId !== pageId) {
    return (
      <div className="border-warning text-sm my-2 rounded border bg-warning-subtle p-3">
        This whiteboard belongs to another Page and cannot be copied here.
      </div>
    );
  }
  if (error && !board)
    return <div className="border-danger text-sm my-2 rounded border bg-danger-subtle p-3">{error}</div>;

  const canvas = board ? (
    <Excalidraw
      // Keyed by board id, not revision: revision bumps on every autosave, and
      // keying on it would remount (and visibly flicker) the whole canvas after
      // every single edit. It should only remount when this component starts
      // representing a genuinely different board.
      key={board.id}
      initialData={{ ...(board.scene as any), libraryItems: initialLibraryItems }}
      excalidrawAPI={setExcalidrawAPI}
      viewModeEnabled={readOnly}
      onChange={(elements, appState, files) => save({ elements: [...elements], appState, files })}
      onLibraryChange={handleLibraryChange}
    />
  ) : (
    <div className="text-sm flex h-full items-center justify-center text-tertiary">Loading whiteboard…</div>
  );

  return (
    <div
      className={cn(
        "my-2 flex flex-col overflow-hidden rounded border border-subtle bg-layer-1",
        fullscreen && "shadow-xl fixed inset-6 z-[120]"
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-subtle px-3 py-2">
        <span className="text-sm flex items-center gap-2 font-medium">
          <PenTool className="size-4" /> Whiteboard
          {libraryStatus === "loading" && (
            <span className="text-xs font-normal text-tertiary">Loading library…</span>
          )}
          {libraryStatus === "error" && (
            <span className="text-xs text-danger font-normal">Library sync failed</span>
          )}
        </span>
        <div className="flex items-center gap-3">
          {!readOnly && (
            <label className="text-sm text-accent flex cursor-pointer items-center gap-1">
              <ImagePlus className="size-4" /> Add image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void addImage(e.target.files?.[0])}
              />
            </label>
          )}
          <button
            type="button"
            className="text-tertiary hover:text-primary"
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={() => setFullscreen((value) => !value)}
          >
            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        </div>
      </div>
      {error && <div className="border-danger text-sm border-b bg-danger-subtle px-3 py-2">{error}</div>}
      <div
        contentEditable={false}
        // flex-1 (flex-basis: 0%) only resolves against a parent with a definite
        // height, which fullscreen has (`inset-6`) and the default inline layout
        // doesn't — there the explicit height below must drive sizing instead,
        // or flex-grow has no free space to distribute and this collapses to 0.
        className={cn("relative min-h-0", fullscreen && "flex-1")}
        style={{ height: fullscreen ? undefined : canvasHeight }}
      >
        {canvas}
      </div>
      {!fullscreen && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize whiteboard"
          onMouseDown={handleResizeStart}
          className="flex h-3 shrink-0 cursor-row-resize items-center justify-center border-t border-subtle bg-layer-2 hover:bg-layer-3"
        >
          <GripHorizontal className="size-3 text-tertiary" />
        </div>
      )}
    </div>
  );
}
