/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useCallback, useEffect, useRef, useState } from "react";
// The subpath, not the package root: this hook ships in the page's main bundle, and the root would drag
// the whole board (Plait, Slate, ~550 KB) into every page load. The board itself is lazy-loaded by the embed.
import { collectWhiteboardAssetIds } from "@plane/whiteboard/asset-ids";
import type { WhiteboardScene } from "@plane/whiteboard";

import { PageWhiteboardService } from "@/services/page";

const whiteboardService = new PageWhiteboardService();

export const WHITEBOARD_AUTOSAVE_DELAY_MS = 700;

/**
 * - `idle`: nothing has been edited since the board was loaded.
 * - `saving`: an edit is waiting for the debounce, or its request is in flight.
 * - `saved`: the latest edit is stored.
 * - `error`: the request failed. The edit is kept and goes out with the next one.
 * - `conflict`: someone else saved first (HTTP 409). Nothing more is sent until `reset`.
 */
export type TWhiteboardSaveState = "idle" | "saving" | "saved" | "error" | "conflict";

type TParams = {
  workspaceSlug?: string;
  projectId?: string;
  pageId?: string;
  boardId: string;
  /** Edits are dropped while false (a read-only page). */
  enabled: boolean;
};

const getErrorStatus = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } } | null)?.response?.status;

/**
 * Debounced, single-flight autosave for one whiteboard.
 *
 * The API rejects a save whose `expected_revision` is stale, so two requests must never be
 * in flight together: the second would carry the revision the first is about to replace and
 * fail against our own write. Edits made while a request is out are merged into one follow-up.
 * A 409 is never retried or overwritten; the caller decides how to recover and calls `reset`.
 *
 * Each save also carries `asset_ids`: the images the scene uses. The API rejects an ID that is not an
 * uploaded asset of this page, so only IDs known to belong to it are sent: those the board came with
 * and those uploaded here (`noteAsset`). An image copied in from another page is left out instead of
 * making every later save fail.
 */
export const useWhiteboardAutosave = ({ workspaceSlug, projectId, pageId, boardId, enabled }: TParams) => {
  const [saveState, setSaveState] = useState<TWhiteboardSaveState>("idle");
  const revisionRef = useRef<number | null>(null);
  const knownAssetIdsRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<WhiteboardScene | null>(null);
  const inFlightRef = useRef(false);
  const conflictRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetRef = useRef({ workspaceSlug, projectId, pageId, boardId });
  targetRef.current = { workspaceSlug, projectId, pageId, boardId };
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const flush = useCallback(async () => {
    clearTimer();
    if (inFlightRef.current || conflictRef.current) return;
    const scene = pendingRef.current;
    const expectedRevision = revisionRef.current;
    const target = targetRef.current;
    if (!scene || expectedRevision === null) return;
    if (!target.workspaceSlug || !target.projectId || !target.pageId) return;

    pendingRef.current = null;
    inFlightRef.current = true;
    setSaveState("saving");
    try {
      const saved = await whiteboardService.update(
        target.workspaceSlug,
        target.projectId,
        target.pageId,
        target.boardId,
        {
          scene,
          asset_ids: collectWhiteboardAssetIds(scene.children).filter((id) => knownAssetIdsRef.current.has(id)),
          expected_revision: expectedRevision,
        }
      );
      revisionRef.current = saved.revision;
      if (pendingRef.current) {
        // Edited again while this request was out: the follow-up goes through the debounce.
        timerRef.current = setTimeout(() => void flush(), WHITEBOARD_AUTOSAVE_DELAY_MS);
      } else {
        setSaveState("saved");
      }
    } catch (error) {
      if (getErrorStatus(error) === 409) {
        conflictRef.current = true;
        pendingRef.current = null;
        setSaveState("conflict");
      } else {
        // Keep the newest scene; the next edit schedules another attempt.
        pendingRef.current ??= scene;
        setSaveState("error");
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [clearTimer]);

  const schedule = useCallback(
    (scene: WhiteboardScene) => {
      if (!enabledRef.current || conflictRef.current) return;
      pendingRef.current = scene;
      setSaveState("saving");
      clearTimer();
      // A request already in flight schedules the follow-up itself when it returns.
      if (!inFlightRef.current) timerRef.current = setTimeout(() => void flush(), WHITEBOARD_AUTOSAVE_DELAY_MS);
    },
    [clearTimer, flush]
  );

  /**
   * Start over from a freshly loaded board: forget pending edits and any conflict.
   * `assetIds` are the assets the stored board says belong to it.
   */
  const reset = useCallback(
    (revision: number, assetIds: string[] = []) => {
      clearTimer();
      pendingRef.current = null;
      conflictRef.current = false;
      revisionRef.current = revision;
      knownAssetIdsRef.current = new Set(assetIds);
      setSaveState("idle");
    },
    [clearTimer]
  );

  /** Record an asset uploaded for this page, so scenes that use it may list it in `asset_ids`. */
  const noteAsset = useCallback((assetId: string) => {
    knownAssetIdsRef.current.add(assetId);
  }, []);

  // Do not lose the last 700 ms of work when the node view unmounts or the tab is hidden.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void flush();
    };
  }, [flush]);

  return { saveState, schedule, reset, noteAsset };
};
