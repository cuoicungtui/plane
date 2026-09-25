/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Link } from "react-router";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { getPageName } from "@plane/utils";
// components
import { PageMentionIcon } from "@/components/editor/embeds/mentions/page-icon";
// services
import { ProjectPageService } from "@/services/page/project-page.service";
// store
import type { TPageInstance } from "@/store/pages/base-page";

const projectPageService = new ProjectPageService();

type Props = {
  page: TPageInstance;
};

export const PageNavigationPaneBacklinksTabPanel = observer(function PageNavigationPaneBacklinksTabPanel(props: Props) {
  const { page } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const projectId = page.project_ids?.[0];

  const { data: backlinks, isLoading } = useSWR(
    workspaceSlug && projectId && page.id ? `PAGE_BACKLINKS_${workspaceSlug}_${projectId}_${page.id}` : null,
    () => projectPageService.fetchBacklinks(workspaceSlug!.toString(), projectId!, page.id!),
    { revalidateOnFocus: true }
  );

  if (isLoading) return null;

  if (!backlinks || backlinks.length === 0) {
    return (
      <div className="grid size-full place-items-center px-6">
        <div className="space-y-2.5 text-center">
          <h4 className="text-14 font-medium">{t("page_navigation_pane.tabs.backlinks.empty_state.title")}</h4>
          <p className="text-13 font-medium text-secondary">
            {t("page_navigation_pane.tabs.backlinks.empty_state.description")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col px-4">
      <p className="mt-3 mb-2 text-12 font-medium text-tertiary">
        {t("page_backlinks.count", { count: backlinks.length })}
      </p>
      <ul className="flex-1 space-y-0.5 overflow-y-auto">
        {backlinks.map((backlink) => (
          <li key={backlink.id}>
            <Link
              to={`/${workspaceSlug}/projects/${projectId}/pages/${backlink.id}`}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-13 hover:bg-layer-transparent-hover"
            >
              <PageMentionIcon logoProps={backlink.logo_props} size={16} />
              <span className="truncate">{getPageName(backlink.name ?? undefined)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
});
