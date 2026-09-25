/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import { useParams } from "next/navigation";
// plane imports
import { EPageAccess } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
import type { EPageStoreType } from "@/hooks/store";
import { usePageStore } from "@/hooks/store";

/**
 * @description creates a sub-page under `parentId` with the parent's access, opens its branch and goes to the new page.
 */
export const useAddChildPage = (storeType: EPageStoreType, onCreated: (parentId: string) => void) => {
  const { workspaceSlug, projectId } = useParams();
  const router = useAppRouter();
  const { t } = useTranslation();
  const { getPageById, createPage } = usePageStore(storeType);

  return useCallback(
    async (parentId: string) => {
      const parent = getPageById(parentId);
      if (!parent) return;
      try {
        const page = await createPage({ parent: parentId, access: parent.access ?? EPageAccess.PUBLIC });
        onCreated(parentId);
        if (page?.id) router.push(`/${workspaceSlug?.toString()}/projects/${projectId?.toString()}/pages/${page.id}`);
      } catch {
        setToast({ type: TOAST_TYPE.ERROR, title: t("common.error.label"), message: t("page_tree.create_error") });
      }
    },
    [createPage, getPageById, onCreated, projectId, router, t, workspaceSlug]
  );
};
