/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { BadgeCheck, TriangleAlert } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import { cn, getPageVerificationStatus, renderFormattedDate } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
// store
import type { TPageInstance } from "@/store/pages/base-page";

type Props = {
  page: TPageInstance;
  /** `compact` shows only the icon, for dense list rows */
  variant?: "compact" | "full";
};

export const PageVerifiedBadge = observer(function PageVerifiedBadge({ page, variant = "full" }: Props) {
  const { t } = useTranslation();
  const { getUserDetails } = useMember();
  const { status } = getPageVerificationStatus(page);
  if (status === "none" || page.archived_at) return null;

  const isExpired = status === "expired";
  const expiry = page.verify_expires_at ? renderFormattedDate(page.verify_expires_at) : undefined;
  const label = isExpired
    ? t("page_verification.expired")
    : expiry
      ? t("page_verification.verified_until", { date: expiry })
      : t("page_verification.verified");
  const verifier = page.verified_by ? getUserDetails(page.verified_by)?.display_name : undefined;
  const details = [
    verifier && page.verified_at
      ? t("page_verification.verified_by", { name: verifier, date: renderFormattedDate(new Date(page.verified_at)) })
      : undefined,
    expiry
      ? t(isExpired ? "page_verification.expired_on" : "page_verification.expires_on", { date: expiry })
      : t("page_verification.never_expires"),
  ]
    .filter(Boolean)
    .join(" · ");
  const Icon = isExpired ? TriangleAlert : BadgeCheck;

  return (
    <Tooltip tooltipHeading={label} tooltipContent={details}>
      <span
        role="status"
        aria-label={label}
        className={cn(
          "flex h-6 flex-shrink-0 cursor-default items-center gap-1 rounded-sm px-1.5 text-11 font-medium whitespace-nowrap",
          isExpired ? "bg-warning-subtle text-warning-primary" : "bg-success-subtle text-success-primary"
        )}
      >
        <Icon className="size-3.5 flex-shrink-0" />
        {variant === "full" && <span>{label}</span>}
      </span>
    </Tooltip>
  );
});
