/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Link } from "react-router";
// plane imports
import { useTranslation } from "@plane/i18n";
import { getPageName } from "@plane/utils";
// hooks
import { EPageStoreType, usePage } from "@/hooks/store";
// local imports
import { PageMentionIcon } from "./page-icon";

type Props = {
  id: string;
};

export const EditorPageMention = observer(function EditorPageMention({ id }: Props) {
  const { t } = useTranslation();
  const page = usePage({ pageId: id, storeType: EPageStoreType.PROJECT });

  if (!page) {
    return (
      <span className="not-prose inline rounded-sm bg-layer-1 px-1 py-0.5 text-tertiary no-underline">
        {t("page_backlinks.unavailable")}
      </span>
    );
  }

  return (
    <Link
      to={page.getRedirectionLink()}
      className="not-prose inline-flex items-center gap-1 rounded-sm bg-accent-subtle-active px-1 py-0.5 text-accent-primary no-underline hover:underline"
    >
      <PageMentionIcon logoProps={page.logo_props} />
      <span>{getPageName(page.name)}</span>
    </Link>
  );
});
