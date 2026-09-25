/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
// hooks
import { getValueFromLocalStorage, setValueIntoLocalStorage } from "@/hooks/use-local-storage";

const getStorageKey = (projectId: string) => `wiki-page-tree-expanded:${projectId}`;

const readExpandedIds = (projectId: string): Set<string> => {
  const stored = getValueFromLocalStorage(getStorageKey(projectId), []);
  return new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : []);
};

/**
 * @description the open branches of a project's page tree, remembered in localStorage and shared by every view of
 * the tree. Use it with `key={projectId}` on the component so the stored branches are read again for each project.
 */
export const usePageTreeExpansion = (projectId: string) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
    projectId ? readExpandedIds(projectId) : new Set()
  );

  const updateExpandedIds = useCallback(
    (update: (current: Set<string>) => Set<string>) => {
      setExpandedIds((current) => {
        const next = update(current);
        setValueIntoLocalStorage(getStorageKey(projectId), [...next]);
        return next;
      });
    },
    [projectId]
  );

  const toggle = useCallback(
    (pageId: string) =>
      updateExpandedIds((current) => {
        const next = new Set(current);
        if (!next.delete(pageId)) next.add(pageId);
        return next;
      }),
    [updateExpandedIds]
  );

  const expand = useCallback(
    (pageId: string) => updateExpandedIds((current) => new Set(current).add(pageId)),
    [updateExpandedIds]
  );

  return { expandedIds, toggle, expand };
};
