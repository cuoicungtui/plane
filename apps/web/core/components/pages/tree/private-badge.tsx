/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { LockKeyhole } from "lucide-react";
// plane imports
import { EPageAccess } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";

type Props = {
  access: EPageAccess | undefined;
  isMobile?: boolean;
};

export function PagePrivateBadge({ access, isMobile }: Props) {
  const { t } = useTranslation();
  if (access !== EPageAccess.PRIVATE) return null;

  return (
    <Tooltip tooltipContent={t("page_tree.private_hint")} isMobile={isMobile}>
      <span className="flex shrink-0" aria-label={t("page_tree.private_hint")}>
        <LockKeyhole className="size-3 text-tertiary" />
      </span>
    </Tooltip>
  );
}
