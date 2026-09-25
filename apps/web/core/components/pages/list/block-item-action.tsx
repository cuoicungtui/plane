/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Earth } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { LockIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { Avatar, FavoriteStar } from "@plane/ui";
import { calculateTimeAgo, cn, getFileURL, renderFormattedDate } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { usePageOperations } from "@/hooks/use-page-operations";
// plane web hooks
import type { EPageStoreType } from "@/hooks/store";
// store
import type { TPageInstance } from "@/store/pages/base-page";
// local imports
import { PageActions } from "../dropdowns";
import { PageVerifiedBadge } from "../verification";

export const HOVER_ONLY_CLASS = "lg:opacity-0 lg:focus-within:opacity-100 lg:group-hover:opacity-100";

type Props = {
  page: TPageInstance;
  parentRef: React.RefObject<HTMLElement>;
  storeType: EPageStoreType;
};

export const BlockItemAction = observer(function BlockItemAction(props: Props) {
  const { page, parentRef, storeType } = props;
  // store hooks
  const { t } = useTranslation();
  const { getUserDetails } = useMember();
  // page operations
  const { pageOperations } = usePageOperations({
    page,
  });
  // derived values
  const { access, created_at, updated_at, is_favorite, owned_by, canCurrentUserFavoritePage } = page;
  const ownerDetails = owned_by ? getUserDetails(owned_by) : undefined;

  return (
    <>
      {/* owner and time of the last edit: always visible, like the columns of a Notion database */}
      <div className="flex cursor-default items-center gap-2">
        <PageVerifiedBadge page={page} variant="compact" />
        <Tooltip tooltipHeading={t("page_tree.owned_by")} tooltipContent={ownerDetails?.display_name}>
          <Avatar src={getFileURL(ownerDetails?.avatar_url ?? "")} name={ownerDetails?.display_name} />
        </Tooltip>
        {updated_at && (
          <Tooltip tooltipContent={t("page_tree.created_on", { date: renderFormattedDate(created_at) })}>
            <span className="text-11 whitespace-nowrap text-tertiary">
              {t("page_tree.updated", { time: calculateTimeAgo(updated_at) })}
            </span>
          </Tooltip>
        )}
      </div>
      <div className={cn("cursor-default text-tertiary", HOVER_ONLY_CLASS)}>
        <Tooltip tooltipContent={access === 0 ? t("page_tree.public") : t("page_tree.private")}>
          {access === 0 ? <Earth className="h-4 w-4" /> : <LockIcon className="h-4 w-4" />}
        </Tooltip>
      </div>
      {/* a favorite stays visible; the other row actions appear on hover or keyboard focus */}
      {canCurrentUserFavoritePage && (
        <div className={cn({ [HOVER_ONLY_CLASS]: !is_favorite })}>
          <FavoriteStar
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              pageOperations.toggleFavorite();
            }}
            selected={is_favorite}
          />
        </div>
      )}
      <div className={HOVER_ONLY_CLASS}>
        <PageActions
          optionsOrder={[
            "open-in-new-tab",
            "copy-link",
            "make-a-copy",
            "verify",
            "unverify",
            "toggle-lock",
            "toggle-access",
            "archive-restore",
            "delete",
          ]}
          page={page}
          parentRef={parentRef}
          storeType={storeType}
        />
      </div>
    </>
  );
});
