/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
// plane editor
import type { TMentionSection } from "@plane/editor";
// plane types
import type { TSearchEntities, TSearchResponse } from "@plane/types";
import { getPageName } from "@plane/utils";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";
// local components
import { PageMentionIcon } from "@/components/editor/embeds/mentions/page-icon";

export type TUseAdditionalEditorMentionArgs = {
  enableAdvancedMentions: boolean;
};

export type TAdditionalEditorMentionHandlerArgs = {
  response: TSearchResponse;
};

export type TAdditionalEditorMentionHandlerReturnType = {
  sections: TMentionSection[];
};

export type TAdditionalParseEditorContentArgs = {
  id: string;
  entityType: TSearchEntities;
};

export type TAdditionalParseEditorContentReturnType =
  | {
      redirectionPath: string;
      textContent: string;
    }
  | undefined;

export const useAdditionalEditorMention = (args: TUseAdditionalEditorMentionArgs) => {
  const { enableAdvancedMentions } = args;
  const projectPageStore = usePageStore(EPageStoreType.PROJECT);

  const updateAdditionalSections = useCallback(
    ({ response }: TAdditionalEditorMentionHandlerArgs): TAdditionalEditorMentionHandlerReturnType => {
      const pages = (response.page ?? []).filter((page): page is typeof page & { id: string } => !!page.id);
      if (!enableAdvancedMentions || pages.length === 0) return { sections: [] };
      return {
        sections: [
          {
            key: "pages",
            title: "Pages",
            items: pages.map((page) => ({
              icon: <PageMentionIcon logoProps={page.logo_props} />,
              id: page.id,
              entity_identifier: page.id,
              entity_name: "page",
              title: getPageName(page.name),
            })),
          },
        ],
      };
    },
    [enableAdvancedMentions]
  );

  const parseAdditionalEditorContent = useCallback(
    ({ id, entityType }: TAdditionalParseEditorContentArgs): TAdditionalParseEditorContentReturnType => {
      if (entityType !== "page") return undefined;
      const page = projectPageStore.getPageById(id);
      if (!page) return undefined;
      return {
        redirectionPath: page.getRedirectionLink().replace(/^\//, ""),
        textContent: getPageName(page.name),
      };
    },
    [projectPageStore]
  );

  const editorMentionTypes: TSearchEntities[] = useMemo(
    () => (enableAdvancedMentions ? ["user_mention", "page"] : ["user_mention"]),
    [enableAdvancedMentions]
  );

  return {
    updateAdditionalSections,
    parseAdditionalEditorContent,
    editorMentionTypes,
  };
};
